# Desktop updates and draft releases

## Status and trust boundary

The release tooling is implemented, but production activation, public downloads,
and real-device N→N+1 installation are **unverified** until the
checklist below is completed. Setup creates no production key, tag, or live release.

There are two independent signing systems:

- **Optional paid OS signing:** Apple Developer ID + notarization; Windows Authenticode.
  These establish OS trust for the app/installer. Linux packages are not OS-signed
  by this workflow.
- **Updater signing:** Tauri/minisign signs each update archive/installer using
  `TAURI_SIGNING_PRIVATE_KEY`. The matching public key is compiled into the app.
  HTTPS alone and an OS signature do not replace this verification.

PR/main builds and manual builds with `updater=false` have no injected updater
config, no updater signing key, and no update feed or release. Native updater commands must remain unavailable
when the compiled updater config is absent or the binary is a debug build.

### Free distribution (the default)

Version-tag releases use **updater signatures without paid OS certificates**.
No Apple membership or Windows certificate is required. Public GitHub Releases
can host the installers and feed without a hosting fee.

macOS builds are not Developer ID signed or notarized (local/ad-hoc signing is
not equivalent). Windows installers are not Authenticode signed. Gatekeeper,
SmartScreen, antivirus, or managed-device policies may warn or block installation
or later upgrades. Updater signatures validate update authenticity; they do not
grant OS trust or bypass these checks. Do not ask users to disable system security
globally. Test real downloaded installers, including quarantine behavior, before
publishing, and clearly disclose warnings in release notes.

OS signing remains opt-in: set repository variable `DESKTOP_PLATFORM_SIGNING=true`
for tag releases, or select `sign=true` in manual dispatch. Missing required
certificates still fail an explicitly OS-signed build; there is no silent fallback.

Generate the free updater key once, outside the repository:

```sh
mkdir -p ~/.pocket-gba
pnpm exec tauri signer generate --write-keys ~/.pocket-gba/updater.key
```

Choose a strong password. Store the private file's **contents**, its password,
and the `.pub` file's contents in the settings below. Keep an encrypted offline
backup; never commit the private key. This command creates no Apple or Windows
certificate and does not build or publish the app.

## Activation prerequisites (repository Settings)

1. Protect the `release` environment with required reviewers, prevent
   self-approval, and restrict deployment refs to reviewed release tags. The four
   signing jobs use this environment **before** accessing signing keys or importing
   certificates. A later draft job uses it too; draft approval is not the only gate.
   Restrict tag creation with repository rulesets as well.
2. Set explicit repository variables (no implicit production defaults):
   - `DESKTOP_UPDATE_PUBLIC_KEY`: the actual contents of the Tauri-generated `.pub`
     file: base64 wrapping the complete minisign public-key text (including its
     untrusted-comment header), not just the inner `RW...` key packet.
   - `DESKTOP_UPDATE_ENDPOINT`: publicly accessible HTTPS feed, without credentials,
     query tokens, fragments, or custom ports. It must match
     `https://github.com/<DESKTOP_UPDATE_REPOSITORY>/releases/latest/download/latest.json`
     exactly; an unrelated repository, beta feed, custom mirror, or version-pinned
     feed is rejected.
   - `DESKTOP_UPDATE_REPOSITORY`: public `owner/repository` distribution destination.
3. `infynitehq/vba` has been verified public. When distributing there, the recommended
   endpoint is `https://github.com/infynitehq/vba/releases/latest/download/latest.json`.
   These values must still be explicitly configured. Do not assume any future source
   repository is public. A private source repository needs a **separate public**
   distribution repository, explicit configuration, and an existing matching version
   tag in that repository before staging (`gh release create --verify-tag`).
   Distribution-repository tags must identify the reviewed source commit; never let
   GitHub create a tag implicitly at an unrelated default-branch commit.
4. Store the actual encrypted private updater key as secret
   `TAURI_SIGNING_PRIVATE_KEY`, with its password in
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when required. Do not use dummy keys or commit
   private keys. Provision keys offline using the Tauri CLI's signer workflow;
   protect an encrypted offline backup and store the password separately.
5. **Only if opting into OS signing**, configure Apple secrets: `APPLE_CERTIFICATE` (base64 P12),
   `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
   `APPLE_PASSWORD` (app-specific), and `APPLE_TEAM_ID`.
   Configure Windows `WINDOWS_CERTIFICATE` (base64 PFX) and
   `WINDOWS_CERTIFICATE_PASSWORD`. OS-signed builds fail if required credentials are absent.
   Existing isolated macOS keychain and Windows certificate cleanup runs on failure.
6. For same-repository releases, the scoped job `GITHUB_TOKEN` supplies release-write
   permission. For another public distribution repo, put a narrowly scoped
   fine-grained token with Contents write on that repo in `DESKTOP_RELEASE_TOKEN`
   (in the protected release environment). Never embed this token in the feed or app.
   The public-repository preflight uses read-only public API access; publication does
   not require exposing this protected token to unapproved jobs.
7. Independently confirm the endpoint and release-asset URLs work without
   authentication. Static URL validation rejects local hosts/IP literals and
   credentials but cannot prove DNS, visibility, redirects, or availability. The
   workflow additionally checks that the selected distribution repo is public.
   The feed URL may initially return 404 until the first stable release is published.

The generated temporary merged Tauri config is exactly:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<configured public key>",
      "endpoints": ["<configured HTTPS endpoint>"],
      "requireSignedVersion": true
    }
  },
  "bundle": { "createUpdaterArtifacts": true }
}
```

`scripts/updater-config.mjs` writes it outside the source tree in the runner's
temporary directory. It never writes the private key into the config. Builds
without updater enabled do not call this helper or pass this config. Platform
signing config and updater config are merged on Windows, not substituted.
The private updater key is scoped only to the config-validation step and native
signing/build steps, never dependency installation, lint, tests, collection,
assembly, or draft staging. Those verification steps need the public key only.
Production requires updater plugin 2.14.1 or newer and
`requireSignedVersion: true`: the native verifier cryptographically checks that
the announced manifest version matches the version in the signature's trusted
comment. The pinned Tauri CLI writes that version automatically during builds.
Collection and final assembly independently verify every updater signature against
`DESKTOP_UPDATE_PUBLIC_KEY` using Node's Ed25519 and BLAKE2b-512 primitives. They
enforce strict Tauri/minisign encodings and matching key IDs, verify the artifact
signature and global trusted-comment signature, and only then trust the comment's
version. Absent, duplicate or mismatched `version:` fields fail closed.
The implementation follows `minisign-verify`'s exact packet/global-signature scheme
and is cross-checked against the updater crate's Tauri CLI-produced test vector.
These release checks supplement, not replace, native cryptographic verification.
Do not reuse legacy signatures lacking a signed version for a new release.

## Release flow

- Reviewed `v*` tag pushes start draft-release builds; only valid SemVer-like
  `vMAJOR.MINOR.PATCH[-prerelease]` tags proceed. Updater signing is always enabled;
  paid OS signing defaults to off unless `DESKTOP_PLATFORM_SIGNING=true`.
- Manual dispatch remains available. Select the existing tag's commit and enter
  the exact tag. `updater=true` (default) stages an updater-signed draft;
  `updater=false` produces CI artifacts only, without an update feed or draft.
  `sign` independently controls optional paid OS signing and defaults to false.
  Both signing paths require approval before accessing their secrets.
- `pnpm release:version --check --tag "$RELEASE_TAG"` must pass before building.
  All versioned manifests must match the exact release version; a tag pointing to
  another workflow commit is rejected.
- Builds run on macOS 15 ARM64, macOS 15 Intel, Windows 2022 x64 (NSIS), and
  Ubuntu 22.04 x64 (AppImage and Debian).
- macOS explicitly requests `--bundles app,dmg`. Keeping the `.app` allows codesign,
  Gatekeeper and stapler checks when OS signing is selected; the updater also needs its
  `.app.tar.gz` + `.sig`. A DMG alone is not an updater artifact.
- macOS needs tar archive/signature + DMG, Windows NSIS EXE/signature, Linux
  AppImage/signature + DEB. `.deb` is **manual installation only**, not the updater
  archive. Use an installed AppImage for Linux updater QA; do not claim DEB
  self-update support.
- Collection gives every binary and signature a unique OS/architecture/version
  filename and records its byte count and SHA-256 in per-target metadata.
  Both macOS targets may originally produce the same archive filename; upload
  names cannot collide.
- Only after **all four jobs succeed**, one final job validates all metadata,
  signatures, expected archives/installers, hashes and unique targets/filenames.
  It creates a single feed with keys `darwin-aarch64`, `darwin-x86_64`,
  `windows-x86_64`, `linux-x86_64`. Feed signatures are **file contents**, not paths.
  Download URLs are version-specific, encoded HTTPS release-asset URLs, never a
  mutable `latest` archive URL. Never overwrite assets for an existing version.
- Stable tags produce a non-prerelease **draft** containing `latest.json`.
  Prerelease tags (including beta) produce a prerelease **draft** containing
  `prerelease.json`, never `latest.json`. Prerelease binaries use the configured
  stable feed so a later stable version can be offered; there is no beta channel
  discovery. GitHub's `/releases/latest` must remain a stable release.
- Staging refuses an existing release; it never edits, overwrites or publishes one.
  After upload it rereads the GitHub release and requires the draft flag, correct
  channel, exact asset list, uploaded state, size and GitHub SHA-256 digest for
  **every** expected asset. Missing digest or asset fails closed. A failed upload
  can leave an incomplete draft: do not publish it; inspect and clean up manually
  before retrying. `release-draft-verification` is retained as CI evidence.

## Publication approval and N→N+1 QA

The workflow never publishes a draft. A release manager must:

1. Inspect the staged draft verification and independently download every asset;
   verify checksums, updater signatures, and clean-install behavior. For OS-signed
   builds, also verify Windows Authenticode and macOS Developer ID,
   Gatekeeper/notarization/stapling. For OS-unsigned builds, verify and document
   actual OS warnings/approval behavior; never claim OS signing or notarization.
2. Complete source/legal/distribution checks and release notes: include dependency
   licenses and satisfy corresponding-source requirements described in README.
   Confirm all four architectures contain the intended version, and no secrets,
   credentials or internal URLs are present.
3. Bootstrap **N** using a manually downloaded/installed updater-signed production
   build with the intended feed and public key compiled in. Older non-updater
   versions cannot acquire updater support retroactively: manual installation is
   required once. Do not auto-migrate or delete ROMs/saves.
4. Use an isolated public QA distribution repository/feed and disposable machines
   to test **N→N+1** before promoting production. Match real target keys and formats.
   Test successful update/relaunch/version check, save persistence, consent/cancel,
   no update, offline/404/malformed feed, missing platform, altered archive,
   wrong signature, interrupted download/install, and recovery through manual install.
   Test both Mac architectures, Windows NSIS and Linux AppImage. Confirm debug and
   builds without updater configuration cannot invoke the native updater commands.
   OS-unsigned production builds with the proper updater key/feed must be able to
   check, verify, and request a save-approved installation.
5. Ensure a beta/prerelease is not marked latest and cannot replace stable feed
   discovery. Test a prerelease client can subsequently reach the intended stable
   version. Do not point stable clients at a beta feed.
6. Confirm anonymous public access and immutable URLs, then **manually publish**
   the approved stable draft and mark it the latest stable release in GitHub.
   Publication makes `latest.json` available to existing clients; do not publish
   merely to test signatures. Recheck anonymous downloads after publication.
   For a prerelease, preserve the prerelease flag and never mark it latest.

This procedure is a required manual gate, not evidence that production QA has
already passed. Do not advertise automatic updates as operational before validation.

## Key rotation, loss, and recovery

Back up the encrypted private updater key securely. OS certificate renewals and
updater key rotations are independent operations. Do not silently replace the
updater public key in a feed: existing clients trust the compiled old key.

For planned rotation, while the old key is still available, release a bridge
binary signed with the old updater key that installs the next trusted public key.
Validate that clients actually receive the bridge before switching distribution to
new-key-only signatures. A single-key feed cannot simultaneously serve old-key
and new-key clients indefinitely; use a carefully tested migration/feed strategy
or require lagging clients to manually reinstall. Document supported paths.

If the private key or its password is lost, old clients cannot trust updates
signed with a replacement. Ship a newly signed manual installer and communicate
the recovery path; never disable verification to bypass the loss. If compromised,
stop publication, rotate/revoke affected credentials, assess exposure and provide
trusted manual recovery. Deleting a bad feed does not undo an installed update.

## Local tooling checks (no publishing)

```sh
node --test tests/release/*.test.mjs
```

Tests use synthetic artifact files, ephemeral Ed25519 test keys/signatures and
the upstream public CLI test vector. Test keys are never persisted or used for
releases; tests do not access or publish GitHub releases.
`pnpm release:version --check --tag v0.2.0` is the independent version check
(replace the example with the actual version). `actionlint` can validate the three
workflows when installed. No local test proves OS signing or production updates.

### Local verification for 0.2.0

- 127 frontend unit tests, 23 release-tooling tests, and 28 Rust tests passed.
- All 32 web E2E tests passed.
- All 11 desktop-frontend tests passed in both Chromium and WebKit, including
  real-core checkpoint persistence before update approval, cancellation on save
  failure, playback recovery, and verified-download installation retries.
- TypeScript, ESLint, scoped Prettier, Rust formatting, and Actionlint passed.
- An unsigned Apple Silicon DMG built successfully at approximately 6.33 MiB,
  compared with 5.25 MiB before adding updater/TLS functionality. This local build
  has no production feed/key injected, so native updating is intentionally disabled.

The real native smoke test found a startup wake-lock permission failure that
browser tests did not reproduce. The desktop player now leaves wake-lock ownership
to the React shell instead of making a redundant core request. Two consecutive
native runs then passed with no errors or notification dialogs, 124 emulated
frames each, and a persisted 528472-byte checkpoint after safe exit. The speculative
native-window resize workaround was removed.

Browser desktop tests mock native transport; Rust signature tests exercise the
actual updater verifier using public fixtures. Neither is evidence that a signed
N→N+1 installer has run on macOS, Windows, or Linux. Complete the activation and
real-device upgrade checklist before publishing an updater-enabled bootstrap build.

### Free-release workflow validation

After separating paid OS signing from updater signing, all 31 release-tooling tests
passed, including independent signing-mode selection, required updater signatures,
and accurate draft warnings. ESLint, formatting, and Actionlint also passed. No
installer was rebuilt, no production key generated, and no release staged or
published as part of this change. Real OS-unsigned N→N+1 installation remains
unverified.
