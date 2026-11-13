# Pocket GBA native shell

Tauri 2 sources live here, not in `src-tauri`. Run the root desktop scripts;
they invoke the CLI with this directory as its working directory. Both Vite
hooks explicitly use the repository root. Web builds remain independent.

## Frontend contract

Use `@tauri-apps/api/core`'s `invoke` and `@tauri-apps/api/event`'s `listen`.
Register shutdown listening before enabling gameplay.
Immediately after the listener is attached, `invoke('desktop_ready')` replays
any close request received during renderer bootstrap (otherwise it is a no-op).

- `invoke('import_file', { kind })`: returns `null` on cancellation, otherwise
  `{ name: string, bytes: number[] }`. Kinds: `rom` (`gba`/`zip`, 64 MiB),
  `cheats` (`json`, 4 MiB), `battery` (`sav`, 64 MiB), `state`
  (`state`/`save`, 64 MiB). Extension matching is case-insensitive.
  The frontend must still validate file contents, ZIP expansion limits, and
  imported data schemas.
- `invoke('export_file', { name, bytes: Array.from(bytes) })`: `true` after
  writing and syncing, `false` if cancelled. Maximum 64 MiB. `name` is a
  suggested basename only; the native save dialog exclusively selects the
  destination and confirms overwrites.
- File → Open Game (`Cmd/Ctrl+O`) emits `desktop:open-game` with no data.
  Register its listener only while the Library is active; the shell never
  navigates away from or replaces a running game.
- `desktop:close-requested` event payload: `{ requestId: string }`. Await all
  player checkpoint/battery writes, then call
  `invoke('complete_shutdown', { requestId })`. On save failure or user
  cancellation, call `invoke('cancel_shutdown', { requestId })`.
  Unknown, stale, already cancelled or already completed IDs reject; do not
  treat duplicate acknowledgements as permission for another shutdown.

Close-button, Cmd/Ctrl+W, menu Quit, Cmd/Ctrl+Q, and normal application exit
requests go through the same state machine. Repeated requests do not start
parallel saves. A quit request upgrades a pending close to quit. After 20
seconds, a native dialog offers Retry saving (re-emits the **same** ID), Cancel
closing, or explicitly Quit without saving. Retry handlers should not cache a
failed promise forever. Crashes, OS termination, power loss and forced process
termination cannot be made save-safe.

On macOS, an acknowledged close destroys the window but leaves the application
resident. Dock activation and second-instance activation recreate/focus its
window; Quit actually exits. Elsewhere, the last acknowledged close exits.

## Security

The same-origin emulator iframe isolates emulator globals and lifecycle, not
native privileges. Treat all bundled frontend/player JavaScript as trusted.
In particular, Tauri cannot distinguish iframe IPC from its parent on Linux;
window capabilities alone must not be relied on to deny iframe access.

AppManifest generates explicit permissions for application commands; only the
local `main` webview receives them. No remote IPC capability, filesystem
plugin, shell plugin or JavaScript dialog plugin is installed.
The renderer cannot submit native paths. Rust checks import extensions,
regular-file status, bounded reads (including growth during read), export
basenames, and byte limits. Selected file contents never leave the computer.
Exports write to a private temporary file in the selected destination directory,
sync its contents, then atomically replace the selected file. Failed writes
leave an existing backup intact rather than truncating it.

Top-level navigation is restricted to the local Tauri origin (or the exact
loopback development origin in debug builds). The CSP permits local
EmulatorJS WASM evaluation and blob resources but no network assets.
`invoke('open_external', { url })` accepts only these four exact strings:
`https://github.com/infynitehq/vba`,
`https://github.com/infynitehq/vba/releases`,
`https://github.com/EmulatorJS/EmulatorJS`,
`https://github.com/mgba-emu/mgba`.
No alternate paths, trailing slash, query, fragment, credentials or non-HTTPS
scheme are accepted. Opening uses the `open` crate's native OS browser launcher,
not renderer-provided shell commands.

## Packaging and verification

Build on each target OS. Platform configuration files select DMG on macOS,
NSIS on Windows, and deb/AppImage on Linux. Use `--bundles app` for a macOS
application bundle without a disk image.
The configured macOS floor is Ventura 13.0 (modern Safari/WebView support), not
Catalina. This is provisional: only the current development host has compiled
the shell; minimum-OS behavior still needs verification on target hardware.
Linux requires Tauri's WebKitGTK 4.1/GTK3 development packages; rfd uses GTK3
directly so save-recovery dialogs do not require Zenity. Windows uses WebView2
(the installer can download its bootstrapper if absent). Windows installation
may therefore require network access when WebView2 is missing. Gameplay is
offline after installation and local asset setup.

`public/logo.svg` is the only committed icon source. Root desktop commands generate
the five configured platform icons automatically; `pnpm make-icons --desktop`
also prepares them for direct Cargo commands. Generated `public/icons/` and
`desktop/icons/` files are ignored by Git; mobile/store variants are not retained.
`Cargo.lock` is committed for reproducible application builds.

Normal builds contain no updater key or endpoint. Release tooling may merge
`plugins.updater` containing the real signing public key and HTTPS manifest
endpoints, and `bundle.createUpdaterArtifacts: true`, through the Tauri CLI
configuration. No private signing key belongs in compiled configuration. Platform
signing/notarization is separate; unsigned beta packages may trigger OS warnings.
The merged updater configuration **must** set `requireSignedVersion: true`;
native setup rejects configurations that omit or disable it. Sign artifacts with
Tauri CLI's app-version binding (`tauri build` sets this automatically; standalone
`tauri signer sign` requires `--app-version`). There is no unversioned-signature
compatibility mode.

### Native updater contract

- `update_status()` and `check_for_update()` return the full status object;
  debug builds always return `disabled`, even with release configuration.
- `download_update({ updateId })` downloads an offer retained in Rust.
  `cancel_update_download({ updateId })` cancels that download. Stale IDs and
  overlapping actions reject. There is no renderer-supplied URL or key.
- `install_update({ updateId })` requires verified downloaded bytes and queues
  `desktop:close-requested`. Only `complete_shutdown` for that request can
  install, after the frontend finishes preparing/checkpointing/saving.
  On invoke failure the frontend must undo prepared-player state using its
  existing shutdown failure handler.
- `desktop:update-status` carries the full status:
  `{ phase, currentVersion, readyToInstall, updateId?, version?, notes?, downloadedBytes?,
totalBytes?, error?, reason? }`. Phases are `disabled`, `idle`, `checking`,
  `available`, `downloading`, `downloaded`, `preparing`, `installing`, `error`.
- Signature validation uses `tauri-plugin-updater` before reporting downloaded,
  and again inside its installer. The native downloader enforces verified
  HTTPS (including redirects), 256 MiB maximum, a five-minute total timeout,
  and cancellation; manifest checks have a 30-second timeout.
- Installation errors retain verified bytes for retry.
  `readyToInstall` is derived for every snapshot: true only with retained bytes
  in `downloaded` or `error`, allowing installation retry without redownloading.
  Cancel closing, ordinary
  Close/Quit, or explicit force-quit abort a pending update, never force-install.
  Rust restarts only after successful installation (Windows installers may
  terminate/relaunch the already save-approved process themselves).
- Non-AppImage Linux installations require manual package updates. macOS
  disk-image and read-only/protected installation locations refuse automatic
  updates with instructions to move the app to a writable Applications folder.

Only the custom application commands have webview permissions. The updater
plugin's general JavaScript commands are deliberately not authorized.

Run `cargo fmt --check`, `cargo check --locked`, and `cargo test --locked` here.
Compilation on macOS is not proof of Windows/Linux packaging or interactive
WebView/save-dialog behavior; test each target and real emulator shutdown
before release.

## Opt-in real-native-webview smoke

Build a **debug** application bundle using the root desktop build wrapper with
`--debug --bundles app`. Close any running Pocket GBA instance first, then run
its actual executable with `POCKET_GBA_SMOKE_REPORT` set to an absolute JSON
filename beneath the OS temporary directory (the parent directory must exist).
No development server or additional hook is needed for an embedded debug build.

Only debug builds compile `smoke.rs` and its initialization script. Without the
environment variable, even a debug build injects nothing. Release builds have
no smoke module, injected script, navigation-report interception or forced
smoke-exit path.

Opted-in smoke windows use an incognito/ephemeral WebView data store, isolated
from the production user profile. The test verifies IndexedDB across a reload
and routes in the same webview/process; it does **not** verify persistence
across application restarts.

The harness seeds its own original ARM diagnostic ROM into IndexedDB, reloads
the actual bundled React Library, launches real EmulatorJS/mGBA WASM, waits for
more than 120 emulated frames, uses the Library/Exit game controls, then checks
the committed checkpoint contains a real core state. It removes only its own
game and checkpoint on success. It never clears user data; if the identical
diagnostic ROM is already present it fails instead of changing that entry.
Native code writes the JSON report and exits with status 0/1. A hard 60-second
native watchdog reports failure even if JavaScript stalls.

This is supplemental native-engine coverage, **not** proof of physical
controllers, native file-dialog interaction, menu invocation, window placement,
or every close/quit recovery path. Those require interactive target-OS testing.
