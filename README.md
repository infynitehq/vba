# Pocket GBA

Play your own Game Boy Advance games on the web or desktop. Local library, touch
and keyboard controls, cheats, save states, and offline play. No accounts or uploads.

## Get started

Requires **Node 22.19+** and **pnpm 12**.

```sh
pnpm install
pnpm fetch-emulator
pnpm dev
```

Open **http://localhost:5173** and add a `.gba` file or a ZIP containing one game.
The emulator download includes no games.

## Commands

| Command              | What it does              |
| -------------------- | ------------------------- |
| `pnpm build`         | Build the web app         |
| `pnpm preview`       | Preview the web build     |
| `pnpm desktop:dev`   | Run the desktop app       |
| `pnpm desktop:build` | Build a desktop installer |
| `pnpm test`          | Run unit tests            |
| `pnpm lint`          | Check code quality        |

Desktop uses **Tauri 2** and requires Rust and
[platform tools](https://v2.tauri.app/start/prerequisites/).

## Desktop releases

Public GitHub Releases can distribute macOS `.dmg`, Windows `.exe`, and Linux
`.AppImage` / `.deb` installers without paid signing certificates. OS-unsigned
macOS and Windows builds may trigger security warnings or be blocked.

Updates still require a **free cryptographic signing key**, your consent, and a
successful save before installation. Apple/Windows signing is optional and
separate. See [release and updater setup](docs/updates.md); updates are not live
until configured and tested.

[Sponsor my work](https://github.com/sponsors/tech-savvy-guy)—the games run on
nostalgia. The developer runs on coffee.

## Good to know

- **Offline:** on the web, wait for **Ready offline**. Test with a production build, not `pnpm dev`.
- **Phone:** open the HTTPS site and add it to your home screen.
- **Saves:** keep external backups. Browser and desktop data are separate.
- **Cheats:** changes apply when you reopen the game.
- **Deploy:** Vercel configuration is included; the web build outputs to `dist/`.
- **Icons:** `public/logo.svg` is the source. Web and desktop commands generate
  their icons automatically; generated files are ignored by Git.

## Legal

Bring your own legally obtained games. No ROMs or BIOS are bundled.
Not affiliated with Nintendo.

Powered by EmulatorJS (GPL-3.0) and mGBA. Redistribution must comply with their
licenses and corresponding-source requirements.
