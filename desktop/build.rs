fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "import_file",
            "export_file",
            "complete_shutdown",
            "cancel_shutdown",
            "desktop_ready",
            "open_external",
            "update_status",
            "check_for_update",
            "download_update",
            "cancel_update_download",
            "install_update",
        ]),
    ))
    .expect("failed to build desktop application");
}
