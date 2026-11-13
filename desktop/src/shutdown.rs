use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Intent {
    Close,
    Quit,
    Update,
}

struct Pending {
    id: String,
    intent: Intent,
}

impl Pending {
    fn merge(&mut self, intent: Intent) {
        // An ordinary close/quit cancels an update. An update must never
        // upgrade an ordinary shutdown into an installation.
        if intent != Intent::Update && (intent == Intent::Quit || self.intent == Intent::Update) {
            self.intent = intent;
        }
    }
}

#[derive(Default)]
struct State {
    pending: Option<Pending>,
    approved_exit: bool,
    update_reserved: bool,
}

impl State {
    fn acknowledge(&mut self, id: &str, force_quit: bool, macos: bool) -> Result<Intent, String> {
        if !self.pending.as_ref().is_some_and(|p| p.id == id) {
            return Err("No matching shutdown request".into());
        }
        let pending = self.pending.take().unwrap();
        let intent = if force_quit {
            Intent::Quit
        } else {
            pending.intent
        };
        self.approved_exit = intent == Intent::Quit || intent == Intent::Update || !macos;
        Ok(intent)
    }
}

#[derive(Default)]
pub struct Shutdown(Mutex<State>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CloseRequest {
    request_id: String,
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub fn exit_approved(app: &tauri::AppHandle) -> bool {
    app.state::<Shutdown>().0.lock().unwrap().approved_exit
}

#[cfg(debug_assertions)]
pub fn smoke_exit(app: &tauri::AppHandle, code: i32) {
    app.state::<Shutdown>().0.lock().unwrap().approved_exit = true;
    app.exit(code);
}

pub fn request(app: &tauri::AppHandle, intent: Intent) {
    super::updater::shutdown_action(app, intent != Intent::Update, || request_inner(app, intent));
}

pub fn busy(app: &tauri::AppHandle) -> bool {
    let managed = app.state::<Shutdown>();
    let state = managed.0.lock().unwrap();
    state.pending.is_some() || state.approved_exit || state.update_reserved
}

// Caller holds updater state: lock order is always updater -> shutdown.
pub fn reserve_update(app: &tauri::AppHandle) -> Result<(), String> {
    let managed = app.state::<Shutdown>();
    let mut state = managed.0.lock().unwrap();
    if state.pending.is_some() || state.approved_exit || state.update_reserved {
        return Err("Another shutdown or update is already pending.".into());
    }
    if app.get_webview_window("main").is_none() {
        return Err("Reopen the application window before installing an update.".into());
    }
    state.update_reserved = true;
    Ok(())
}

fn request_inner(app: &tauri::AppHandle, intent: Intent) {
    let id = {
        let state = app.state::<Shutdown>();
        let mut state = state.0.lock().unwrap();
        if state.approved_exit {
            return;
        }
        if intent == Intent::Update && !state.update_reserved {
            return;
        }
        state.update_reserved = false;
        if let Some(pending) = state.pending.as_mut() {
            pending.merge(intent);
            return;
        }
        // No renderer remains to save after an already acknowledged window close.
        if app.get_webview_window("main").is_none() {
            if intent == Intent::Close {
                return;
            }
            state.approved_exit = true;
            drop(state);
            app.exit(0);
            return;
        }
        let id = format!("shutdown-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
        state.pending = Some(Pending {
            id: id.clone(),
            intent,
        });
        id
    };
    let _ = app.emit_to(
        "main",
        "desktop:close-requested",
        CloseRequest {
            request_id: id.clone(),
        },
    );
    arm_timeout(app.clone(), id);
}

fn arm_timeout(app: tauri::AppHandle, id: String) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(20));
        if !is_pending(&app, &id) {
            return;
        }
        let choice = rfd::MessageDialog::new()
            .set_title("Pocket GBA is still saving")
            .set_description("The player has not confirmed that your progress is saved. Retry saving, cancel closing, or explicitly quit without saving. Unsaved progress may be lost.")
            .set_level(rfd::MessageLevel::Warning)
            .set_buttons(rfd::MessageButtons::YesNoCancelCustom(
                "Retry saving".into(),
                "Quit without saving".into(),
                "Cancel closing".into(),
            ))
            .show();
        if !is_pending(&app, &id) {
            return;
        }
        match choice {
            rfd::MessageDialogResult::Custom(ref label) if label == "Retry saving" => {
                let _ = app.emit_to(
                    "main",
                    "desktop:close-requested",
                    CloseRequest {
                        request_id: id.clone(),
                    },
                );
                arm_timeout(app, id);
            }
            rfd::MessageDialogResult::Custom(ref label) if label == "Quit without saving" => {
                // The only forced exit path requires explicit native confirmation.
                let _ = finish(&app, &id, true);
            }
            _ => {
                let _ = cancel(&app, &id);
            }
        }
    });
}

fn is_pending(app: &tauri::AppHandle, id: &str) -> bool {
    app.state::<Shutdown>()
        .0
        .lock()
        .unwrap()
        .pending
        .as_ref()
        .is_some_and(|p| p.id == id)
}

fn cancel(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    super::updater::cancel_shutdown_action(app, || {
        let state = app.state::<Shutdown>();
        let mut state = state.0.lock().unwrap();
        if !state.pending.as_ref().is_some_and(|p| p.id == id) {
            return Err("No matching shutdown request".into());
        }
        state.pending = None;
        state.update_reserved = false;
        Ok(())
    })
}

fn finish(app: &tauri::AppHandle, id: &str, force_quit: bool) -> Result<(), String> {
    let intent = {
        let state = app.state::<Shutdown>();
        let mut state = state.0.lock().unwrap();
        state.acknowledge(id, force_quit, cfg!(target_os = "macos"))?
    };
    if intent == Intent::Update {
        if let Err(error) = super::updater::install_saved(app) {
            app.state::<Shutdown>().0.lock().unwrap().approved_exit = false;
            return Err(error);
        }
    } else if intent == Intent::Quit {
        super::updater::abort(app);
        app.exit(0);
    } else if let Some(window) = app.get_webview_window("main") {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn complete_shutdown(app: tauri::AppHandle, request_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || finish(&app, &request_id, false))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_shutdown(app: tauri::AppHandle, request_id: String) -> Result<(), String> {
    cancel(&app, &request_id)
}

#[tauri::command]
pub fn desktop_ready(app: tauri::AppHandle) -> Result<(), String> {
    let id = app
        .state::<Shutdown>()
        .0
        .lock()
        .unwrap()
        .pending
        .as_ref()
        .map(|pending| pending.id.clone());
    if let Some(request_id) = id {
        app.emit_to(
            "main",
            "desktop:close-requested",
            CloseRequest { request_id },
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_shutdown_cannot_turn_into_installation() {
        for initial in [Intent::Close, Intent::Quit] {
            let mut pending = Pending {
                id: "save-request".into(),
                intent: initial,
            };
            pending.merge(Intent::Update);
            assert_eq!(pending.intent, initial);
            assert_eq!(pending.id, "save-request");
        }
    }

    #[test]
    fn close_and_quit_abort_pending_update_without_new_save_request() {
        for next in [Intent::Close, Intent::Quit] {
            let mut pending = Pending {
                id: "save-request".into(),
                intent: Intent::Update,
            };
            pending.merge(next);
            assert_eq!(pending.intent, next);
            assert_eq!(pending.id, "save-request");
        }
    }

    #[test]
    fn quit_upgrades_close_and_cannot_be_downgraded() {
        let mut pending = Pending {
            id: "save-request".into(),
            intent: Intent::Close,
        };
        pending.merge(Intent::Quit);
        pending.merge(Intent::Close);
        assert_eq!(pending.intent, Intent::Quit);
    }

    #[test]
    fn update_exit_is_only_approved_after_matching_save_acknowledgment() {
        let mut state = State {
            pending: Some(Pending {
                id: "save-request".into(),
                intent: Intent::Update,
            }),
            ..Default::default()
        };
        assert!(!state.approved_exit);
        assert!(state.acknowledge("stale-request", false, true).is_err());
        assert!(!state.approved_exit);
        assert!(state.pending.is_some());
        assert_eq!(
            state.acknowledge("save-request", false, true).unwrap(),
            Intent::Update
        );
        assert!(state.approved_exit);
        assert!(state.acknowledge("save-request", false, true).is_err());
    }

    #[test]
    fn force_quit_never_installs_a_pending_update() {
        let mut state = State {
            pending: Some(Pending {
                id: "save-request".into(),
                intent: Intent::Update,
            }),
            ..Default::default()
        };
        assert_eq!(
            state.acknowledge("save-request", true, true).unwrap(),
            Intent::Quit
        );
        assert!(state.approved_exit);
        assert!(state.pending.is_none());
    }
}
