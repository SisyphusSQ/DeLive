# Build & Release

DeLive SQ releases are built and signed locally, then uploaded manually to
[GitHub Releases](https://github.com/SisyphusSQ/DeLive/releases).
The first SQ prerelease is `2.3.0-sq.1`, for macOS Apple Silicon (arm64) only.
It is Developer ID signed, without Apple notarization or in-app updates.

See the [release procedure and signing evidence](../zh/development/build.md)
for the authoritative instructions, migration steps, and acceptance limits.

## Build

```bash
npm run build
```

This generates icons, builds the frontend, and compiles Electron. Node.js
22.12.0 or newer is required. The application version comes from the root
`package.json`; the frontend package has its own independent version.

## Package

```bash
env -u APPLE_KEYCHAIN_PROFILE -u DELIVE_ALLOW_ADHOC \
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  npx electron-builder --mac --arm64 --publish never \
  --config.directories.output=release/2.3.0-sq.1
```

The signing hook selects a usable Developer ID Application identity from the
local keychain, signs nested code, and checks signatures and certificate
revocation. `APPLE_KEYCHAIN_PROFILE` explicitly enables optional notarization;
leave it unset for a signed-only release. Never upload private signing keys or
notarization credentials to the repository.

| Setting | Value |
|---------|-------|
| App ID | `io.github.sisyphussq.delive` |
| Product | `DeLive SQ` |
| Release assets | arm64 DMG, ZIP, `SHA256SUMS` |
| Publish config | `null`; manual GitHub prerelease |
| In-app updates | Disabled |

The application uses a separate `DeLive SQ` user data directory and does not
automatically migrate data from upstream DeLive. The release process does not
replace an existing local installation.

## CI and manual publication

Normal development CI remains in `.github/workflows/ci.yml`. Release metadata
commits use `[skip ci]` to reuse existing test evidence without rerunning tests
during release finalization. Build, signing, archive, checksum, and release
readback steps still run.

The inherited `.github/workflows/release.yml` has been removed because its
macOS artifacts were ad-hoc signed. Pushing a version tag no longer builds or
publishes a release. The optional `test-build.yml` still produces temporary
artifacts and is not a source of signed release packages.

After the release metadata is merged, tag that commit and create a draft
prerelease with the locally signed DMG, ZIP, and checksum file. Review the
assets and notes before publishing, and keep it excluded from `latest`.
Do not upload build logs, previous installations, user data, or local evidence.

Before hashing and upload, rename the DMG and ZIP from `DeLive SQ-...` to
`DeLive-SQ-...` so GitHub does not rewrite their asset names. Keep the app
bundle name unchanged. See the Chinese procedure for exact commands.

Generate release notes after packaging and generating `SHA256SUMS`:

```bash
GITHUB_REPOSITORY=SisyphusSQ/DeLive \
  node scripts/generate-release-notes.mjs 2.3.0-sq.1 \
  > release/2.3.0-sq.1/release-notes.md
```

The notes read the matching `CHANGELOG.md` section and the assets in
`release/<version>/`. They identify the package as signed but not notarized,
explain manual updates, and retain the documented acceptance limits.
