const APPROVED_URLS: [&str; 6] = [
    "https://github.com/infynitehq/vba",
    "https://github.com/infynitehq/vba/releases",
    "https://github.com/EmulatorJS/EmulatorJS",
    "https://github.com/mgba-emu/mgba",
    "mailto:dattasoham805@gmail.com",
    "https://github.com/sponsors/tech-savvy-guy",
];

fn validate_url(url: &str) -> Result<(), String> {
    if APPROVED_URLS.contains(&url) {
        Ok(())
    } else {
        Err("Only approved project, license, contact, and sponsor links may be opened".into())
    }
}

#[tauri::command]
pub async fn open_external(url: String) -> Result<(), String> {
    // Exact matching rejects alternate schemes, credentials, subdomains,
    // arbitrary paths, query strings, fragments, whitespace and shell syntax.
    validate_url(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        open::that_detached(url).map_err(|error| format!("Cannot open external link: {error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_project_allowlist_only() {
        for url in APPROVED_URLS {
            assert!(validate_url(url).is_ok(), "{url}");
        }
        for url in [
            "http://github.com/infynitehq/vba",
            "https://github.com/infynitehq/vba/",
            "https://github.com/infynitehq/vba?download=evil",
            "https://github.com/infynitehq/vba#fragment",
            "https://github.com@evil.test/infynitehq/vba",
            "https://github.com.evil.test/infynitehq/vba",
            "https://github.com/infynitehq/vba/issues",
            "file:///tmp/game",
            "mailto:test@example.com",
            "mailto:dattasoham805@gmail.com?body=unexpected",
            "mailto:dattasoham805@gmail.com,other@example.com",
            "https://github.com/infynitehq/vba; open /tmp",
            "https://github.com/sponsors/another-user",
            "https://github.com/sponsors/tech-savvy-guy?redirect=evil",
        ] {
            assert!(validate_url(url).is_err(), "{url}");
        }
    }
}
