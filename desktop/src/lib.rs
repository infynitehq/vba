mod files;
mod links;
mod shutdown;
#[cfg(debug_assertions)]
mod smoke;
mod updater;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager, WebviewWindowBuilder,
};

fn ensure_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => {
            let builder = WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?;
            #[cfg(debug_assertions)]
            let builder = smoke::configure(builder);
            #[cfg(debug_assertions)]
            let smoke_app = app.clone();
            builder
                .on_navigation(move |url| {
                    #[cfg(debug_assertions)]
                    if smoke::navigation(&smoke_app, url) {
                        return false;
                    }
                    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                        || (matches!(url.scheme(), "http" | "https")
                            && url.host_str() == Some("tauri.localhost"))
                        || (cfg!(debug_assertions)
                            && url.scheme() == "http"
                            && url.host_str() == Some("127.0.0.1")
                            && url.port() == Some(1420))
                })
                .build()?
        }
    };
    window.show()?;
    window.unminimize()?;
    window.set_focus()?;
    Ok(())
}

fn install_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "Quit Pocket GBA", true, Some("CmdOrCtrl+Q"))?;
    let close = MenuItem::with_id(app, "close", "Close Window", true, Some("CmdOrCtrl+W"))?;
    let open = MenuItem::with_id(app, "open-game", "Open Game…", true, Some("CmdOrCtrl+O"))?;
    let fullscreen = MenuItem::with_id(app, "fullscreen", "Toggle Full Screen", true, Some("F11"))?;
    #[cfg(target_os = "macos")]
    let file = Submenu::with_items(app, "File", true, &[&open, &close])?;
    #[cfg(not(target_os = "macos"))]
    let file = Submenu::with_items(app, "File", true, &[&open, &close, &quit])?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view = Submenu::with_items(app, "View", true, &[&fullscreen])?;
    #[cfg(target_os = "macos")]
    let application = Submenu::with_items(
        app,
        "Pocket GBA",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    #[cfg(target_os = "macos")]
    let menu = Menu::with_items(app, &[&application, &file, &edit, &view])?;
    #[cfg(not(target_os = "macos"))]
    let menu = Menu::with_items(app, &[&file, &edit, &view])?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| match event.id().as_ref() {
        "quit" => shutdown::request(app, shutdown::Intent::Quit),
        "close" => shutdown::request(app, shutdown::Intent::Close),
        "open-game" => {
            // Only the Library frontend registers this event. Never navigate
            // away from an active player or replace a game from a native menu.
            if app.get_webview_window("main").is_some() {
                let _ = app.emit_to("main", "desktop:open-game", ());
            }
        }
        "fullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(fullscreen) = window.is_fullscreen() {
                    let _ = window.set_fullscreen(!fullscreen);
                }
            }
        }
        _ => {}
    });
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = ensure_window(app);
        }))
        .manage(shutdown::Shutdown::default())
        .invoke_handler(tauri::generate_handler![
            files::import_file,
            files::export_file,
            shutdown::complete_shutdown,
            shutdown::cancel_shutdown,
            shutdown::desktop_ready,
            links::open_external,
            updater::update_status,
            updater::check_for_update,
            updater::download_update,
            updater::cancel_update_download,
            updater::install_update,
        ])
        .setup(|app| {
            updater::setup(app.handle())?;
            #[cfg(debug_assertions)]
            smoke::start(app.handle());
            install_menu(app.handle())?;
            ensure_window(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                shutdown::request(window.app_handle(), shutdown::Intent::Close);
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to start Pocket GBA");
    app.run(|app, event| match event {
        tauri::RunEvent::ExitRequested { api, code, .. } => {
            if !shutdown::exit_approved(app) {
                api.prevent_exit();
                // Closing the last macOS window must leave the application
                // resident; Dock activation creates a fresh local webview.
                if cfg!(target_os = "macos")
                    && code.is_none()
                    && app.get_webview_window("main").is_none()
                {
                    return;
                }
                shutdown::request(app, shutdown::Intent::Quit);
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            let _ = ensure_window(app);
        }
        _ => {}
    });
}
