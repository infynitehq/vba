use serde::Serialize;
use std::{
    fs::File,
    io::{self, Read, Write},
    path::Path,
};

const MAX_BYTES: usize = 64 * 1024 * 1024;

#[derive(Serialize)]
pub struct ImportedFile {
    name: String,
    bytes: Vec<u8>,
}

fn import_rules(kind: &str) -> Result<(&'static [&'static str], usize), String> {
    match kind {
        "rom" => Ok((&["gba", "zip"], MAX_BYTES)),
        "cheats" => Ok((&["json"], 4 * 1024 * 1024)),
        "battery" => Ok((&["sav"], MAX_BYTES)),
        // EmulatorJS state exports may have a .state or .save suffix.
        "state" => Ok((&["state", "save"], MAX_BYTES)),
        _ => Err("Unknown import kind".into()),
    }
}

#[tauri::command]
pub async fn import_file(kind: String) -> Result<Option<ImportedFile>, String> {
    let (extensions, limit) = import_rules(&kind)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .set_title("Import into Pocket GBA")
            .add_filter("Supported files", extensions)
            .pick_file()
        else {
            return Ok(None);
        };
        // Dialog filters are advisory: validate the actual selected filename too.
        let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if !extensions.iter().any(|e| extension.eq_ignore_ascii_case(e)) {
            return Err("Unsupported file extension".into());
        }
        let file = File::open(&path).map_err(|e| format!("Cannot open selected file: {e}"))?;
        let metadata = file.metadata().map_err(|e| e.to_string())?;
        if !metadata.is_file() || metadata.len() > limit as u64 {
            return Err(format!(
                "Select a regular file no larger than {} MiB",
                limit / 1024 / 1024
            ));
        }
        let mut bytes = Vec::with_capacity((metadata.len() as usize).min(limit));
        file.take(limit as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > limit {
            return Err("Selected file exceeds the import limit".into());
        }
        let name = path
            .file_name()
            .ok_or("Missing filename")?
            .to_string_lossy()
            .into_owned();
        Ok(Some(ImportedFile { name, bytes }))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn validate_export_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 240
        || name == "."
        || name == ".."
        || name.chars().any(|c| c.is_control() || "/\\:".contains(c))
        || Path::new(name).file_name().and_then(|n| n.to_str()) != Some(name)
    {
        return Err("Export name must be a plain filename".into());
    }
    Ok(())
}

fn validate_export_size(size: usize) -> Result<(), String> {
    if size > MAX_BYTES {
        return Err("Export exceeds 64 MiB".into());
    }
    Ok(())
}

fn atomic_export_with(
    path: &Path,
    write: impl FnOnce(&mut File) -> io::Result<()>,
) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "Export needs a destination directory",
        )
    })?;
    // Creating in the destination directory guarantees the same filesystem.
    // RAII removes incomplete temporary files on every failure before persist.
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    write(temporary.as_file_mut())?;
    temporary.as_file().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[tauri::command]
pub async fn export_file(name: String, bytes: Vec<u8>) -> Result<bool, String> {
    validate_export_name(&name)?;
    validate_export_size(bytes.len())?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .set_title("Export from Pocket GBA")
            .set_file_name(&name)
            .save_file()
        else {
            return Ok(false);
        };
        // The renderer supplies a suggested basename, never an arbitrary destination.
        atomic_export_with(&path, |file| file.write_all(&bytes)).map_err(|e| {
            format!("Cannot finish export; any existing backup was not truncated: {e}")
        })?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_import_kinds() {
        assert_eq!(import_rules("cheats").unwrap().1, 4 * 1024 * 1024);
        assert_eq!(import_rules("rom").unwrap().1, MAX_BYTES);
        assert!(import_rules("../rom").is_err());
    }

    #[test]
    fn export_names_cannot_supply_paths() {
        for name in [
            "",
            ".",
            "..",
            "../save",
            "a/b",
            "a\\b",
            "C:save",
            "bad\nname",
        ] {
            assert!(validate_export_name(name).is_err(), "{name:?}");
        }
        assert!(validate_export_name("My Game.sav").is_ok());
    }

    #[test]
    fn export_size_boundaries() {
        assert!(validate_export_size(0).is_ok());
        assert!(validate_export_size(MAX_BYTES).is_ok());
        assert!(validate_export_size(MAX_BYTES + 1).is_err());
    }

    #[test]
    fn failed_write_preserves_existing_backup_and_cleans_temporary_file() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("backup.sav");
        std::fs::write(&destination, b"previous backup").unwrap();
        let result = atomic_export_with(&destination, |file| {
            file.write_all(b"partial new backup")?;
            Err(io::Error::other("simulated disk write failure"))
        });
        assert!(result.is_err());
        assert_eq!(std::fs::read(&destination).unwrap(), b"previous backup");
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn successful_export_replaces_backup_with_exact_binary_bytes() {
        let directory = tempfile::tempdir().unwrap();
        let destination = directory.path().join("backup.sav");
        std::fs::write(&destination, b"previous longer backup").unwrap();
        let bytes = [0, 255, 13, 10, 128];
        atomic_export_with(&destination, |file| file.write_all(&bytes)).unwrap();
        assert_eq!(std::fs::read(destination).unwrap(), bytes);
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}
