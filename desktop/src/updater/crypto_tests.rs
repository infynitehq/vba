//! Offline cryptographic checks against the real updater plugin, not an installer mock.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;
use tauri_plugin_updater::{Error, Update, UpdaterExt};

// Public fixtures from tauri-plugin-updater 2.14.1's offline_tests (MIT/Apache-2.0).
// Payload is exactly b"test". No private key or production credentials are present.
const PUBLIC_KEY: &str = "untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe";
const SIGNATURE: &str = "untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==";
// Independent public minisign-verify fixture, valid but signed without a version.
const OTHER_PUBLIC_KEY: &str = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
const UNVERSIONED_SIGNATURE: &str = "untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1633700835\tfile:test\tprehashed\nwLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==";

fn configured_key(key: &str, signed_versions: bool) -> serde_json::Value {
    json!({
        "pubkey": STANDARD.encode(key),
        "endpoints": ["https://example.invalid/latest.json"],
        "requireSignedVersion": signed_versions,
    })
}

fn restored(key: &str, signature: &str, version: &str) -> Update {
    // Only Tauri's OS/webview runtime is mocked. Config parsing, release restoration
    // and signature/version verification are the production plugin implementations.
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context
        .config_mut()
        .plugins
        .0
        .insert("updater".into(), configured_key(key, true));
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap();
    app.updater_builder()
        .target("test-target")
        .executable_path("unused-runtime-path/app")
        .configure_client(|_| panic!("offline signature tests must not access the network"))
        .build()
        .unwrap()
        .restore_update(json!({
            "version": version,
            "platforms": {
                "test-target": {
                    "url": "https://example.invalid/package",
                    "signature": STANDARD.encode(signature),
                }
            }
        }))
        .unwrap()
        .unwrap()
}

#[test]
fn native_config_requires_signed_versions() {
    assert!(super::configured(Some(&configured_key(PUBLIC_KEY, true)), false).is_ok());
    let error = super::configured(Some(&configured_key(PUBLIC_KEY, false)), false).unwrap_err();
    assert!(error.contains("requireSignedVersion"));
    let mut missing = configured_key(PUBLIC_KEY, true);
    missing
        .as_object_mut()
        .unwrap()
        .remove("requireSignedVersion");
    assert!(super::configured(Some(&missing), false)
        .unwrap_err()
        .contains("requireSignedVersion"));
}

#[test]
fn actual_plugin_accepts_valid_signed_payload() {
    restored(PUBLIC_KEY, SIGNATURE, "2.0.0")
        .verify(b"test")
        .unwrap();
}

#[test]
fn actual_plugin_rejects_tampered_payload() {
    assert!(matches!(
        restored(PUBLIC_KEY, SIGNATURE, "2.0.0").verify(b"tampered"),
        Err(Error::Minisign(_))
    ));
}

#[test]
fn actual_plugin_rejects_signature_under_another_valid_public_key() {
    assert!(matches!(
        restored(OTHER_PUBLIC_KEY, SIGNATURE, "2.0.0").verify(b"test"),
        Err(Error::Minisign(_))
    ));
}

#[test]
fn actual_plugin_rejects_announced_version_not_bound_to_signature() {
    let error = restored(PUBLIC_KEY, SIGNATURE, "9.0.0")
        .verify(b"test")
        .unwrap_err();
    assert!(matches!(
        error,
        Error::SignedVersionMismatch { signed, announced }
            if signed == "2.0.0" && announced == "9.0.0"
    ));
}

#[test]
fn actual_plugin_rejects_genuine_legacy_signature_without_version() {
    assert!(matches!(
        restored(OTHER_PUBLIC_KEY, UNVERSIONED_SIGNATURE, "2.0.0").verify(b"test"),
        Err(Error::MissingSignedVersion)
    ));
}

#[test]
fn actual_plugin_rejects_tampered_trusted_version_comment() {
    let forged = SIGNATURE.replace("version:2.0.0", "version:9.0.0");
    assert!(matches!(
        restored(PUBLIC_KEY, &forged, "9.0.0").verify(b"test"),
        Err(Error::Minisign(_))
    ));
}
