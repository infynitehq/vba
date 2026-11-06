# Pocket GBA

A minimal, private player for **your own Game Boy Advance game files**. A static, installable React PWA with a local library, touch controls, per-game cheats, and offline play. No accounts, backend, uploads, ROM downloads, bundled games, or BIOS.

## Run

Use **Node 22.19+** and **pnpm 12**.

```sh
pnpm install
pnpm fetch-emulator
pnpm make-icons
pnpm dev
```

The fetch step downloads the **4.2.3** versioned EmulatorJS release assets (~2.91 MiB), checks recorded SHA-256 hashes, and writes only GBA dependencies to the gitignored `public/emulatorjs/` directory. It does not download games. Run it before building a fresh checkout; production builds fail if any required emulator file is missing. Icons are generated from `public/icons/source.svg`; generated PNGs are also included. The fetch script uses the system CA store, useful on managed networks; TLS verification remains enabled.

```sh
pnpm build              # Vite production build + strict TypeScript
pnpm preview            # http://localhost:4173
pnpm test               # Vitest + fake-indexeddb
pnpm lint
pnpm format:check
pnpm exec playwright install chromium
pnpm test:e2e           # production preview; run build first
pnpm audit:pwa          # preview must already be running
```

The service worker is enabled in **production builds**, not in the development server. Don’t test offline behavior in `pnpm dev`. Preview and localhost are trusted browser origins; installation from another device needs **HTTPS**. If Chromium downloads encounter a corporate certificate error, use `NODE_USE_SYSTEM_CA=1 pnpm exec playwright install chromium`.

### Portless: HTTPS and LAN on macOS

Without a shell `PORT` override, `pnpm dev` serves **http://localhost:5173**. With Portless installed, run `portless gba pnpm dev`; Vite uses its injected `PORT` and `HOST`. Portless terminates HTTPS and forwards HTTP to Vite on loopback. No Vite HTTPS or explicit HMR override is needed; WebSockets use the same proxy.

For **https://gba.local** on this Mac and other devices on the same Wi-Fi, start the proxy in LAN mode:

```sh
sudo portless proxy stop
sudo portless proxy start --https --lan --ip 192.168.1.2
portless gba pnpm dev
```

`192.168.1.2` is machine-specific: verify the Mac's current Wi-Fi address in **System Settings → Wi-Fi → Details → TCP/IP** (or `ipconfig getifaddr en0` if Wi-Fi uses `en0`) and replace it before running the command. Reconfigure if that address changes. These commands restart the shared Portless proxy and can interrupt other local apps. Current Portless releases require Node 24+; the application itself supports Node 22.19+.

Open **https://gba.local** on either device, not Vite's upstream port. Portless advertises `.local` names through mDNS; allow incoming proxy connections in the macOS firewall and ensure Wi-Fi client isolation/VPN settings do not block local traffic. Each client device must install and trust Portless's local CA: follow the setup instructions printed by LAN mode. On iOS, enable full trust for the installed root certificate in **Settings → General → About → Certificate Trust Settings**. Do not bypass certificate verification.

In another terminal, check the route:

```sh
portless list
```

For a **502**, compare the route's upstream port with Vite's startup output: they must match. Restart with `portless gba pnpm dev`, remove any manual `--port` overrides, and check for another process occupying the assigned port. Invalid `PORT` values fail with a clear error; `strictPort` prevents silently switching to a port the proxy cannot reach. If the upstream works but the hostname does not, use `portless doctor` to check proxy/DNS/CA setup. If HMR fails, check the browser's WebSocket connection through `wss://gba.local` before adding HMR overrides. LAN HTTPS does not enable the development service worker; test offline behavior with a production build.

## Use on your phone

For a quick controls-only preview, open **`/mobile-layout`** (for example, `https://gba.local/mobile-layout`). No game file is required. The placeholder uses the same touch renderer, toolbar and styles as the real player. Try the controls, cycle **1× → 3× → 0.5×**, rotate the phone, or use **Reset** to start over. Save and emulator-settings actions are disabled in the preview.

On mobile, the player adapts automatically between portrait and landscape when you rotate the phone; it does not require fullscreen or request an orientation lock. Under **More options → Movement controls**, choose **D-pad** or **Joystick**. The thumbstick provides eight-direction digital movement (the GBA has no analog movement input), supports diagonals, and releases when lifted, cancelled, or rotated. Both modes also work in `/mobile-layout`.

1. Open the deployed HTTPS site in Safari (iOS) or Chrome (Android).
2. Add your own `.gba`, or a `.zip` containing exactly one `.gba`. The import limit is 64 MiB (compressed and extracted). A nonstandard header warns rather than blocks; truncated files are rejected. Identical files are detected by SHA-1 and not added twice.
3. Android: use **Install app** in Settings when available, or Chrome’s install menu. iOS: **Share → Add to Home Screen**.
4. On the first visit, wait for **Ready offline** in the footer. The entire app and both GBA core variants (~3.5 MiB total before transport compression) are precached automatically. You can then disconnect, import a new game file, and launch it for the first time entirely offline. No online game launch is needed.
5. Tap the emulator once if audio is locked. Touch buttons are provided by EmulatorJS. In landscape the layout adapts. The app uses the full available viewport; browser chrome remains unless installed or the emulator’s fullscreen action is used.

While the game has focus, **hold Space to fast-forward; release Space to restore the selected speed**. The shortcut uses the current ratio (3× by default), does not change your settings, and releases automatically if focus is lost or the page is hidden. Space still types normally in cheat forms. On mobile, the toolbar's speed button cycles **1× → 3× → 0.5×**. Native speed settings remain available under **Settings → Speed Options**. Actual speed depends on your device.

The mobile player toolbar contains **Pause/Resume**, **Mute/Unmute**, **Speed**, and **More options (⋯)**, without fullscreen. Portrait keeps a separate controller area. Landscape uses the game's natural dark side margins as compact control rails: movement on the left, A/B and Select/Start on the right, with utilities at the upper edges. The game keeps its full height and aspect ratio; narrower screens allow limited edge overlap rather than covering the center. Desktop keeps its fullscreen action. More contains D-pad/joystick selection on mobile, save/load states, battery-save backup/restore, control settings, emulator settings, restart and exit, plus volume adjustment. Restart asks for confirmation. Icons are local, consistent outline SVGs; no icon library, font or CDN is fetched. The More panel supports Escape and keyboard focus containment.

### What “offline” means

A fresh browser needs one connection to download the application, just as installing a native app does. After **Ready offline**, library imports, gameplay, touch controls, cheats, save backup/restore, Settings and deep links work without any network connection. Assets, fonts, icons, scripts, ROMs and saves are local. The app uses no runtime CDN or API. Tailwind is compiled into a local CSS file, not fetched from a CDN. Optional application update checks use only your static host and never interrupt gameplay.

Browser cache eviction or clearing site data can remove the installed app files; no website can override that. Keep save backups outside the browser. Settings reports whether offline assets are present. A failed initial install is not advertised as ready; reconnect and retry setup.

## Cheats and backups

- Open **Cheats** in a library entry or in the player. Add, edit, delete, toggle, or import/export JSON. New cheats start off.
- Supports lines of `XXXXXXXX YYYYYYYY` (GameShark v3 / Action Replay v3) and `XXXXXXXX YYYY` (CodeBreaker). Codes are normalized to uppercase; multiline codes retain their order.
- Cheat changes made during gameplay are saved for the next launch. Save in-game, return to the Library, and reopen the game to apply them. The pinned mGBA core does not safely remove master-code hooks when resetting live cheats; the player submits enabled codes once per fresh session and never rebuilds them while running. A player notice indicates pending changes. This avoids the reproduced enable/disable/re-enable hang, but does not make wrong-version or otherwise incompatible codes safe.
- Optional game code/revision tags warn about region/version mismatches without blocking. Library entries show header game code and revision, including v0.
- Codes can require master codes. Some changes need a restart to undo. **Back up saves before using cheats.** The native API has no success return for code semantics: a correctly formatted but wrong-region code can silently have no effect. Bridge exceptions produce a named toast and do not terminate the game.
- JSON export includes IDs, codes, tags, and enabled state. Import merges by cheat ID. All-game backups match games by content hash, not filenames, so add the identical game files first on another device. A per-game import can intentionally map a backup onto the selected game.
- While playing, open **More options (⋯)** and choose **Backup saves** to download a `.sav`, or **Restore saves** to select your own battery save. Restore overwrites the current battery save; keep a backup first. Save states use separate actions in the same panel and are kept in the browser by default.
- **Save checkpoint on exit** is on by default, with a per-game checkbox in **More options**. Library and toolbar exits pause the game and wait for both an automatic snapshot and existing battery-save data to persist. If either fails, the player stays open and shows an error. On the next launch, choose **Resume checkpoint** for the exact saved position or **Start from game save** for the game's own title/Continue flow. Automatic checkpoints keep a previous generation and never overwrite the manual **Save state** slot. Turning the option off leaves old checkpoints untouched and stops automatic snapshot capture/resume.
- Automatic snapshots are also attempted when the app is hidden or closed. Browser termination, crashes, force-quitting, and OS suspension cannot guarantee completion; use the in-app exit for an awaited save. This feature **does not operate the game's own Save menu**: battery flushing persists only what the game has already written. A snapshot can preserve progress that hasn't been saved in-game, but keep external backups too.
- Games, cheats, save states, and battery saves are separate. Removing a library game deletes its cheats but **keeps emulator saves**. Re-adding the identical file recovers its save identity. **Clear all data** removes library data, emulator save databases and states; it keeps the installed app shell/offline assets.

Persistent storage is requested after the first import. Settings shows the browser’s reported origin usage/quota and persistence status. Quota is an estimate, not a guarantee. Safari, private browsing, low disk space, removing the app, or clearing site data can remove local content. Backups are your responsibility.

## Implementation

- Vite + React 19 + strict TypeScript; **TanStack Router file routes**, Query for local operations, Form + Zod for both cheat forms, **Tailwind CSS 4** through the Vite plugin. No Start, SSR, Table or backend.
- `src/data/` wraps `idb`. Database `pocket-gba`, version 1: `games` (hash index) and `cheats` (gameId index). Related deletion/imports are transactional. Query keys are per entity; mutations invalidate reads. Toggles optimistically update with rollback.
- `public/player.html` / `player.js` load the same-origin database directly through a small static adapter. Each route mount creates a fresh iframe. Only origin-, source-, and channel-checked messages are accepted. ROMs become temporary blob URLs. Emulator globals never enter the React window.
- `public/player-checkpoints.js` owns transaction-confirmed automatic snapshots in `pocket-gba-checkpoints` (`checkpoints`, keyed by game content identity), separate from EmulatorJS's manual states. **Clear all data** removes this database too. Games have an optional `autoSaveOnExit` preference; missing values default to enabled without a schema migration.
- Emulator assets are always self-hosted at `${BASE_URL}emulatorjs/`. **The previous `VITE_EJS_PATH` / CDN mode has been removed** to make offline behavior unconditional. The iframe enforces a same-origin Content Security Policy; query parameters cannot select remote scripts.
- `emulator-files.json` is the single required-file list used by downloading, build validation, Workbox precaching, and offline readiness checks. All emulator files are precached during installation; a cache-first runtime route is retained as a secondary strategy. Player query parameters are ignored for precache matching, not for application behavior. New versions prompt, never silently reload gameplay. “Later” dismisses the current prompt; check again on the next visit.
- Single-column library and Settings, one subtle recent-game outline, no artwork, gradients or marketing panels. System font, dark and light system schemes, safe areas, reduced-motion support, visible focus and native modal focus containment. Tailwind utilities and shared class recipes style the React UI; only the isolated static player uses a tiny inline stylesheet so it can boot independently.

Read [EmulatorJS integration notes](docs/emulatorjs-notes.md) for exact source findings, upstream discrepancies, native API limitations, and license/source links. Read [verification](docs/verification.md) for what was actually tested.

## Static deployment

### Vercel (included)

Import this repository into Vercel and select Node **22.x (22.19+)** or a compatible newer version. `vercel.json` selects the Vite preset, fetches the pinned emulator, makes icons, and builds `dist`. Vercel uses the pnpm version pinned in `package.json`.

The included rewrite provides the SPA fallback for deep links; existing static files, including `player.html` and emulator assets, take precedence. Service-worker responses use `Cache-Control: no-cache`. No functions, secrets, or environment variables are required. Leave `VITE_BASE` unset when deploying at the domain root. Vercel provides the HTTPS required for PWA installation.

Games and saves remain in each browser's local storage, not on Vercel. Preview and production domains have separate storage; export save backups before switching domains.

### Cloudflare Pages

Use build command `pnpm fetch-emulator && pnpm make-icons && pnpm build` and output `dist`. Set a compatible Node version and configure a SPA fallback for deep links. Never rewrite existing player/emulator files to `index.html`.

### GitHub Pages / subdirectory hosting

Build with a trailing-slash base:

```sh
VITE_BASE=/pocket-gba/ pnpm build
cp dist/index.html dist/404.html
```

Upload `dist` using Pages Actions and add `.nojekyll` if deploying via a branch. `VITE_BASE` is read at build time (shell/CI environment, not `.env`); it sets Vite’s base, the manifest scope/start URL, service-worker navigation fallback, and Router’s `basepath` through `import.meta.env.BASE_URL`. Do not change only one of these. GitHub Pages has no real SPA rewrite: the `404.html` variant serves deep links with HTTP 404 online, though the app renders; for clean HTTP 200 routes use Vercel or Cloudflare Pages with rewrites. Installed offline deep links are handled by the service worker.

## Legal and distribution

**Only use files dumped from cartridges you own.** No ROMs or BIOS are bundled, and no ROM download sites are linked. Pocket GBA is not affiliated with Nintendo.

EmulatorJS is GPL-3.0; the fetched directory preserves its license, and mGBA’s core archive includes license/source metadata. Deployments redistributing these files must comply with their licenses and make corresponding sources/modifications available. The only distribution patch localizes an upstream CDN version-check request; its exact recipe is in `scripts/fetch-emulator.mjs`. Source links and pinned integrity records are in this repository. No claim of testing commercial games or every cheat format on real hardware is made.
