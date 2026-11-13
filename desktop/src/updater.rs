//! Native-only updater. The renderer can name opaque offers, never URLs or keys.
use serde::Serialize;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::watch;

const MAX_BYTES: u64 = 256 * 1024 * 1024;
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    phase: &'static str,
    current_version: String,
    ready_to_install: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    update_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    downloaded_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

struct State {
    status: UpdateStatus,
    offer: Option<Arc<Update>>,
    bytes: Option<Arc<Vec<u8>>>,
    cancel: Option<watch::Sender<bool>>,
    download_id: Option<String>,
}

pub struct Updater(Mutex<State>);

fn configured(value: Option<&serde_json::Value>, debug: bool) -> Result<(), String> {
    if debug {
        return Err("Updates are disabled in development builds.".into());
    }
    let value = value.ok_or("Updates are not configured for this build.")?;
    let config: tauri_plugin_updater::Config = serde_json::from_value(value.clone())
        .map_err(|_| "The compiled updater configuration is invalid.")?;
    if config.pubkey.trim().is_empty() || config.endpoints.is_empty() {
        return Err("The compiled updater requires a public key and HTTPS endpoints.".into());
    }
    if !config.require_signed_version {
        return Err(
            "The compiled updater must require signed versions (requireSignedVersion: true)."
                .into(),
        );
    }
    if config.endpoints.iter().any(|url| !secure_url(url))
        || config.dangerous_insecure_transport_protocol
        || config.dangerous_accept_invalid_certs
        || config.dangerous_accept_invalid_hostnames
        || config.allow_downgrades
    {
        return Err("The compiled updater must use verified HTTPS and disallow downgrades.".into());
    }
    Ok(())
}

fn secure_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
}

fn target_supported(
    os: &str,
    appimage: Option<&std::ffi::OsStr>,
    executable: &std::path::Path,
) -> Result<(), String> {
    if os == "linux" && !appimage.is_some_and(|p| !p.is_empty()) {
        return Err("Automatic updates require the AppImage build. Download and install the new package manually.".into());
    }
    if os == "macos" && executable.starts_with("/Volumes") {
        return Err("Move Pocket GBA from the mounted disk image to Applications, then reopen it before updating.".into());
    }
    Ok(())
}

fn install_location() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    target_supported(
        std::env::consts::OS,
        std::env::var_os("APPIMAGE").as_deref(),
        &executable,
    )?;
    #[cfg(target_os = "macos")]
    {
        let bundle = executable
            .ancestors()
            .find(|p| p.extension().is_some_and(|e| e == "app"))
            .ok_or("Install Pocket GBA in Applications before updating.")?;
        // Probe both locations: updater replaces the bundle, not just its executable.
        for directory in [
            bundle,
            bundle.parent().ok_or("Invalid application location")?,
        ] {
            tempfile::NamedTempFile::new_in(directory).map_err(|_| "Pocket GBA is in a read-only or protected location. Move it to a writable Applications folder and reopen it before updating.")?;
        }
    }
    Ok(())
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let result = configured(
        app.config().plugins.0.get("updater"),
        cfg!(debug_assertions),
    )
    .and_then(|_| install_location());
    if result.is_ok() {
        app.plugin(tauri_plugin_updater::Builder::new().build())?;
    }
    app.manage(Updater(Mutex::new(State {
        status: UpdateStatus {
            phase: if result.is_ok() { "idle" } else { "disabled" },
            current_version: app.package_info().version.to_string(),
            ready_to_install: false,
            update_id: None,
            version: None,
            notes: None,
            downloaded_bytes: None,
            total_bytes: None,
            error: None,
            reason: result.err(),
        },
        offer: None,
        bytes: None,
        cancel: None,
        download_id: None,
    })));
    Ok(())
}

impl State {
    fn snapshot(&self) -> UpdateStatus {
        let mut status = self.status.clone();
        status.ready_to_install =
            self.bytes.is_some() && matches!(status.phase, "downloaded" | "error");
        status
    }

    fn abort(&mut self) -> bool {
        if let Some(cancel) = self.cancel.take() {
            let _ = cancel.send(true);
        }
        self.download_id = None;
        match self.status.phase {
            "preparing" => self.status.phase = "downloaded",
            "downloading" => {
                self.status.phase = "available";
                self.status.downloaded_bytes = None;
                self.status.total_bytes = None;
            }
            _ => return false,
        }
        true
    }

    fn require(&self, id: &str, phases: &[&str]) -> Result<(), String> {
        if self.status.update_id.as_deref() != Some(id) {
            return Err("This update is stale. Check for updates again.".into());
        }
        if !phases.contains(&self.status.phase) {
            return Err(format!(
                "Cannot perform this update action while {}.",
                self.status.phase
            ));
        }
        Ok(())
    }

    fn emit(&self, app: &tauri::AppHandle) -> UpdateStatus {
        let status = self.snapshot();
        // Emitting while holding the short state lock keeps event order monotonic.
        let _ = app.emit_to("main", "desktop:update-status", &status);
        status
    }
}

#[tauri::command]
pub fn update_status(app: tauri::AppHandle) -> UpdateStatus {
    app.state::<Updater>().0.lock().unwrap().snapshot()
}

#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    {
        let managed = app.state::<Updater>();
        let mut state = managed.0.lock().unwrap();
        if state.status.phase == "disabled" {
            return Ok(state.snapshot());
        }
        if !matches!(
            state.status.phase,
            "idle" | "available" | "error" | "downloaded"
        ) {
            return Err("Another update action is in progress.".into());
        }
        if super::shutdown::busy(&app) {
            return Err("The application is closing.".into());
        }
        state.offer = None;
        state.bytes = None;
        state.status.update_id = None;
        state.status.version = None;
        state.status.notes = None;
        state.status.downloaded_bytes = None;
        state.status.total_bytes = None;
        state.status.error = None;
        state.status.phase = "checking";
        state.emit(&app);
    }
    let result = async {
        install_location()?;
        let updater = app
            .updater_builder()
            .timeout(CHECK_TIMEOUT)
            .configure_client(|client| {
                client
                    .https_only(true)
                    .redirect(reqwest::redirect::Policy::limited(5))
            })
            .build()
            .map_err(|e| e.to_string())?;
        tokio::time::timeout(CHECK_TIMEOUT, updater.check())
            .await
            .map_err(|_| "Checking for updates timed out.".to_string())?
            .map_err(|e| e.to_string())
    }
    .await;
    let managed = app.state::<Updater>();
    let mut state = managed.0.lock().unwrap();
    match result {
        Ok(Some(update)) if secure_url(&update.download_url) => {
            state.status.phase = "available";
            state.status.update_id = Some(uuid::Uuid::new_v4().to_string());
            state.status.version = Some(update.version.clone());
            state.status.notes = update.body.clone();
            state.offer = Some(Arc::new(update));
        }
        Ok(Some(_)) => {
            state.status.phase = "error";
            state.status.error = Some("The update artifact must use HTTPS.".into());
        }
        Ok(None) => state.status.phase = "idle",
        Err(error) => {
            state.status.phase = "error";
            state.status.error = Some(error);
        }
    }
    Ok(state.emit(&app))
}

fn bounded_size(current: u64, additional: u64, total: Option<u64>) -> Result<u64, String> {
    let size = current
        .checked_add(additional)
        .ok_or("Update size overflow")?;
    if size > MAX_BYTES || total.is_some_and(|n| n > MAX_BYTES) {
        return Err("The update exceeds the 256 MiB download limit. Install it manually.".into());
    }
    Ok(size)
}

#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    update_id: String,
) -> Result<UpdateStatus, String> {
    let download_id = uuid::Uuid::new_v4().to_string();
    let (offer, mut cancel) = {
        let managed = app.state::<Updater>();
        let mut state = managed.0.lock().unwrap();
        state.require(&update_id, &["available", "error"])?;
        if super::shutdown::busy(&app) {
            return Err("The application is closing.".into());
        }
        let offer = state.offer.clone().ok_or("Check for updates again.")?;
        let (tx, rx) = watch::channel(false);
        state.cancel = Some(tx);
        state.download_id = Some(download_id.clone());
        state.bytes = None;
        state.status.phase = "downloading";
        state.status.error = None;
        state.status.downloaded_bytes = Some(0);
        state.status.total_bytes = None;
        state.emit(&app);
        (offer, rx)
    };
    let download = async {
        let client = reqwest::Client::builder()
            .https_only(true)
            .redirect(reqwest::redirect::Policy::limited(5))
            .connect_timeout(Duration::from_secs(15))
            .timeout(DOWNLOAD_TIMEOUT)
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = client
            .get(offer.download_url.clone())
            .headers(offer.headers.clone())
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let total = response.content_length();
        bounded_size(0, 0, total)?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            bounded_size(bytes.len() as u64, chunk.len() as u64, total)?;
            bytes.extend_from_slice(&chunk);
            let managed = app.state::<Updater>();
            let mut state = managed.0.lock().unwrap();
            // Cancellation changes phase immediately, so a late chunk cannot resurrect it.
            state.require(&update_id, &["downloading"])?;
            if state.download_id.as_deref() != Some(&download_id) {
                return Err("Update download cancelled.".into());
            }
            state.status.downloaded_bytes = Some(bytes.len() as u64);
            state.status.total_bytes = total;
            state.emit(&app);
        }
        offer
            .verify(&bytes)
            .map_err(|e| format!("Update signature verification failed: {e}"))?;
        Ok::<_, String>(bytes)
    };
    let result = tokio::select! {
        biased;
        _ = cancel.changed() => Err("Update download cancelled.".into()),
        result = tokio::time::timeout(DOWNLOAD_TIMEOUT, download) => result.unwrap_or_else(|_| Err("The update download timed out.".into())),
    };
    let managed = app.state::<Updater>();
    let mut state = managed.0.lock().unwrap();
    // A cancelled operation must never replace a newer offer or its status.
    if state.status.update_id.as_deref() != Some(&update_id)
        || state.status.phase != "downloading"
        || state.download_id.as_deref() != Some(&download_id)
    {
        return Ok(state.snapshot());
    }
    state.cancel = None;
    state.download_id = None;
    match result {
        Ok(bytes) => {
            state.bytes = Some(Arc::new(bytes));
            state.status.phase = "downloaded";
        }
        Err(error) => {
            state.status.phase = "error";
            state.status.error = Some(error);
        }
    }
    Ok(state.emit(&app))
}

#[tauri::command]
pub fn cancel_update_download(
    app: tauri::AppHandle,
    update_id: String,
) -> Result<UpdateStatus, String> {
    let managed = app.state::<Updater>();
    let mut state = managed.0.lock().unwrap();
    state.require(&update_id, &["downloading"])?;
    state.abort();
    Ok(state.emit(&app))
}

#[tauri::command]
pub fn install_update(app: tauri::AppHandle, update_id: String) -> Result<(), String> {
    {
        let managed = app.state::<Updater>();
        let mut state = managed.0.lock().unwrap();
        state.require(&update_id, &["downloaded", "error"])?;
        if state.bytes.is_none() {
            return Err("Download and verify this update before installing.".into());
        }
        install_location()?;
        // Both command and shutdown request use updater -> shutdown lock order.
        super::shutdown::reserve_update(&app)?;
        state.status.phase = "preparing";
        state.status.error = None;
        state.emit(&app);
    }
    super::shutdown::request(&app, super::shutdown::Intent::Update);
    Ok(())
}

/// Called on cancellation, ordinary Quit/Close, and forced quit. Never install.
pub fn abort(app: &tauri::AppHandle) {
    let managed = app.state::<Updater>();
    let mut state = managed.0.lock().unwrap();
    abort_locked(app, &mut state);
}

pub fn shutdown_action<T>(
    app: &tauri::AppHandle,
    abort_update: bool,
    action: impl FnOnce() -> T,
) -> T {
    let managed = app.state::<Updater>();
    let mut state = managed.0.lock().unwrap();
    if abort_update && !super::shutdown::exit_approved(app) {
        abort_locked(app, &mut state);
    }
    action()
}

pub fn cancel_shutdown_action(
    app: &tauri::AppHandle,
    action: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let managed = app.state::<Updater>();
    let mut state = managed.0.lock().unwrap();
    action()?;
    abort_locked(app, &mut state);
    Ok(())
}

fn abort_locked(app: &tauri::AppHandle, state: &mut State) {
    if state.abort() {
        state.emit(app);
    }
}

/// Only reached after a matching save acknowledgment. No locks during installation.
pub fn install_saved(app: &tauri::AppHandle) -> Result<(), String> {
    let (offer, bytes) = {
        let managed = app.state::<Updater>();
        let mut state = managed.0.lock().unwrap();
        if state.status.phase != "preparing" {
            return Err("The pending update was cancelled.".into());
        }
        let offer = state.offer.clone().ok_or("No pending update")?;
        let bytes = state
            .bytes
            .clone()
            .ok_or("The update has not been downloaded")?;
        state.status.phase = "installing";
        state.emit(app);
        (offer, bytes)
    };
    let result =
        install_location().and_then(|_| offer.install(bytes.as_slice()).map_err(|e| e.to_string()));
    match result {
        Ok(()) => {
            app.restart();
        }
        Err(error) => {
            let managed = app.state::<Updater>();
            let mut state = managed.0.lock().unwrap();
            state.status.phase = "error";
            let error = format!("Could not install the update: {error}. The verified download is retained; retry or install manually.");
            state.status.error = Some(error.clone());
            state.emit(app);
            Err(error)
        }
    }
}

#[cfg(test)]
mod crypto_tests;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn config_is_opt_in_and_debug_always_disabled() {
        assert!(configured(None, false)
            .unwrap_err()
            .contains("not configured"));
        assert!(configured(Some(&serde_json::json!({})), true)
            .unwrap_err()
            .contains("development"));
        assert!(configured(
            Some(&serde_json::json!({"pubkey":"","endpoints":[]})),
            false
        )
        .is_err());
        assert!(configured(
            Some(&serde_json::json!({"pubkey":"not-a-key","endpoints":["http://example.com"]})),
            false
        )
        .is_err());
    }
    #[test]
    fn unsupported_locations_are_actionable() {
        let local = std::path::Path::new("/Applications/Pocket GBA.app/Contents/MacOS/pocket-gba");
        assert!(target_supported("linux", None, local)
            .unwrap_err()
            .contains("manually"));
        assert!(target_supported(
            "linux",
            Some(std::ffi::OsStr::new("/opt/game.AppImage")),
            local
        )
        .is_ok());
        assert!(target_supported(
            "macos",
            None,
            std::path::Path::new("/Volumes/Game/Pocket GBA.app/Contents/MacOS/pocket-gba")
        )
        .unwrap_err()
        .contains("Applications"));
        assert!(target_supported("macos", None, local).is_ok());
    }
    #[test]
    fn limits_cover_advertised_streamed_and_overflow_sizes() {
        assert!(bounded_size(0, 0, Some(MAX_BYTES + 1)).is_err());
        assert!(bounded_size(MAX_BYTES, 1, None).is_err());
        assert!(bounded_size(u64::MAX, 1, None).is_err());
        assert_eq!(bounded_size(MAX_BYTES - 1, 1, None).unwrap(), MAX_BYTES);
    }
    #[test]
    fn transport_rejects_http_and_credentials() {
        for url in [
            "http://example.com/update",
            "https://user:pass@example.com/update",
            "file:///update",
        ] {
            assert!(!secure_url(&url.parse().unwrap()));
        }
        assert!(secure_url(&"https://example.com/update".parse().unwrap()));
    }

    fn state(phase: &'static str) -> State {
        State {
            status: UpdateStatus {
                phase,
                current_version: "1.0.0".into(),
                ready_to_install: false,
                update_id: Some("native-offer".into()),
                version: Some("1.1.0".into()),
                notes: None,
                downloaded_bytes: None,
                total_bytes: None,
                error: None,
                reason: None,
            },
            offer: None,
            bytes: None,
            cancel: None,
            download_id: None,
        }
    }

    #[test]
    fn stale_offers_and_overlapping_actions_are_rejected() {
        for phase in [
            "available",
            "downloading",
            "downloaded",
            "preparing",
            "installing",
            "error",
        ] {
            let state = state(phase);
            assert!(state
                .require("previous-offer", &[phase])
                .unwrap_err()
                .contains("stale"));
        }
        let preparing = state("preparing");
        assert!(preparing
            .require("native-offer", &["downloaded", "error"])
            .is_err());
        assert!(preparing
            .require("native-offer", &["available", "error"])
            .is_err());
        assert!(state("downloading")
            .require("native-offer", &["downloading"])
            .is_ok());
    }

    #[test]
    fn status_contract_uses_camel_case_and_omits_unset_fields() {
        let status = state("downloaded").snapshot();
        let json = serde_json::to_value(status).unwrap();
        assert_eq!(json["currentVersion"], "1.0.0");
        assert_eq!(json["updateId"], "native-offer");
        assert_eq!(json["phase"], "downloaded");
        assert!(json.get("current_version").is_none());
        assert!(json.get("error").is_none());
        assert!(json.get("downloadedBytes").is_none());
        assert_eq!(json["readyToInstall"], false);
    }

    #[test]
    fn install_failure_retains_readiness_but_download_failure_does_not() {
        let mut failed_install = state("error");
        failed_install.bytes = Some(Arc::new(vec![1, 2, 3]));
        failed_install.status.error = Some("Installation location is read-only".into());
        assert!(failed_install.snapshot().ready_to_install);
        assert_eq!(
            failed_install.snapshot().update_id.as_deref(),
            Some("native-offer")
        );
        let mut failed_download = state("error");
        failed_download.status.error = Some("Download signature verification failed".into());
        assert!(!failed_download.snapshot().ready_to_install);
    }

    #[test]
    fn readiness_is_derived_for_every_snapshot_not_reused_from_stale_status() {
        let mut current = state("downloaded");
        current.bytes = Some(Arc::new(vec![1, 2, 3]));
        assert!(current.snapshot().ready_to_install);
        // Even a stale cached flag cannot leak into a response after bytes are cleared.
        current.status.ready_to_install = true;
        current.bytes = None;
        assert!(!current.snapshot().ready_to_install);
        current.bytes = Some(Arc::new(vec![1, 2, 3]));
        for phase in [
            "disabled",
            "idle",
            "checking",
            "available",
            "downloading",
            "preparing",
            "installing",
        ] {
            current.status.phase = phase;
            assert!(!current.snapshot().ready_to_install, "{phase}");
        }
        for phase in ["downloaded", "error"] {
            current.status.phase = phase;
            assert!(current.snapshot().ready_to_install, "{phase}");
        }
    }

    #[test]
    fn abort_preserves_verified_bytes_but_never_authorizes_installation() {
        let mut preparing = state("preparing");
        preparing.bytes = Some(Arc::new(vec![1, 2, 3]));
        assert!(preparing.abort());
        assert_eq!(preparing.status.phase, "downloaded");
        assert_eq!(preparing.bytes.as_ref().unwrap().as_slice(), &[1, 2, 3]);
        assert_eq!(preparing.status.update_id.as_deref(), Some("native-offer"));
        assert!(preparing.require("native-offer", &["preparing"]).is_err());
        let mut installing = state("installing");
        assert!(!installing.abort());
        assert_eq!(installing.status.phase, "installing");
    }

    #[test]
    fn abort_signals_download_cancellation_and_invalidates_worker() {
        let mut downloading = state("downloading");
        let (tx, rx) = watch::channel(false);
        downloading.cancel = Some(tx);
        downloading.download_id = Some("worker-generation".into());
        downloading.status.downloaded_bytes = Some(42);
        downloading.status.total_bytes = Some(100);
        assert!(downloading.abort());
        assert!(*rx.borrow());
        assert_eq!(downloading.status.phase, "available");
        assert!(downloading.download_id.is_none());
        assert!(downloading.status.downloaded_bytes.is_none());
        assert!(downloading.status.total_bytes.is_none());
    }
}
