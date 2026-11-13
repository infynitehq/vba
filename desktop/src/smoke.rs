//! Explicitly opt-in diagnostic for the real native webview. This entire module
//! and its injected script are absent from release builds.
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    time::Duration,
};

struct Smoke {
    report: PathBuf,
    finished: AtomicBool,
    latest: Mutex<Option<serde_json::Value>>,
}

static SMOKE: OnceLock<Smoke> = OnceLock::new();

pub fn start(app: &tauri::AppHandle) {
    let Some(report) = std::env::var_os("POCKET_GBA_SMOKE_REPORT").map(PathBuf::from) else {
        return;
    };
    // Only a caller-approved absolute path beneath the OS temporary directory.
    let valid = report.is_absolute()
        && report
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .is_some_and(|parent| {
                std::env::temp_dir()
                    .canonicalize()
                    .is_ok_and(|tmp| parent.starts_with(tmp))
            });
    if !valid {
        eprintln!("POCKET_GBA_SMOKE_REPORT must be an absolute path in an existing OS temporary directory");
        return;
    }
    if SMOKE
        .set(Smoke {
            report,
            finished: AtomicBool::new(false),
            latest: Mutex::new(None),
        })
        .is_err()
    {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(60));
        let latest = SMOKE
            .get()
            .and_then(|smoke| smoke.latest.lock().ok()?.clone());
        finish(
            &app,
            serde_json::json!({
                "ok": false,
                "error": "Native smoke exceeded its hard 60-second deadline",
                "stage": "native-timeout",
                "lastSnapshot": latest
            }),
        );
    });
}

pub fn configure(
    builder: tauri::WebviewWindowBuilder<'_, tauri::Wry, tauri::AppHandle>,
) -> tauri::WebviewWindowBuilder<'_, tauri::Wry, tauri::AppHandle> {
    if SMOKE.get().is_some() {
        // Isolate diagnostic IndexedDB, cookies and caches from the real user
        // profile. The same webview retains its ephemeral store across reload.
        builder
            .incognito(true)
            .initialization_script(include_str!("native-smoke.js"))
    } else {
        builder
    }
}

pub fn navigation(app: &tauri::AppHandle, url: &tauri::Url) -> bool {
    if SMOKE.get().is_none() || !matches!(url.path(), "/__smoke_report" | "/__smoke_progress") {
        return false;
    }
    let local = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
        || (url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(1420));
    if !local {
        return false;
    }
    let report = url
        .query_pairs()
        .find(|(key, _)| key == "result")
        .and_then(|(_, value)| (value.len() <= 32 * 1024).then_some(value.into_owned()))
        .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
        .unwrap_or_else(|| serde_json::json!({"ok": false, "error": "Malformed smoke report"}));
    if url.path() == "/__smoke_progress" {
        if let Some(smoke) = SMOKE.get() {
            if let Ok(mut latest) = smoke.latest.lock() {
                *latest = Some(report);
            }
        }
    } else {
        finish(app, report);
    }
    true
}

fn finish(app: &tauri::AppHandle, report: serde_json::Value) {
    let Some(smoke) = SMOKE.get() else { return };
    if smoke.finished.swap(true, Ordering::SeqCst) {
        return;
    }
    let ok = report.get("ok").and_then(|v| v.as_bool()) == Some(true);
    let result = serde_json::to_vec_pretty(&report)
        .map_err(std::io::Error::other)
        .and_then(|bytes| std::fs::write(&smoke.report, bytes));
    if let Err(error) = &result {
        eprintln!("Cannot write native smoke report: {error}");
    }
    super::shutdown::smoke_exit(app, if ok && result.is_ok() { 0 } else { 1 });
}
