# DeLive CLI

The desktop app ships a native command line executable. Leave DeLive SQ running in the background while querying meetings. The CLI needs no separate runtime.

| Platform | Executable |
| --- | --- |
| macOS | `/Applications/DeLive SQ.app/Contents/Resources/bin/delive` |
| Windows | `resources\bin\delive.exe` inside the installation directory |
| Linux | `resources/bin/delive` inside the installation directory. For AppImage, copy the executable from the mounted or extracted image |

Run the executable by path or add it to PATH. On macOS you can link it to a directory in your PATH:

```sh
mkdir -p "$HOME/.local/bin"
ln -s "/Applications/DeLive SQ.app/Contents/Resources/bin/delive" \
  "$HOME/.local/bin/delive"
```

Run DeLive SQ and the CLI under the same OS account. The bundled CLI works with Open API switched off and needs no token configuration. For a custom desktop profile, set `DELIVE_USER_DATA_DIR` to its absolute directory. macOS and Linux use a Unix socket in a user-only directory. Windows uses a separate loopback listener with an automatically generated per-launch credential stored in a file readable only by the current user.

```sh
delive health
delive meetings list --limit 10 --offset 0
delive meetings search "project" --json
delive meetings versions MEETING_ID
delive meetings export MEETING_ID --format md --purpose proofreading
delive meetings export MEETING_ID --format srt --output meeting.srt
```

Export uses the Review tab’s adopted version, speaker names and timestamps. The default is a Markdown reading copy. Proofreading includes the version ID and per-segment review markers. Pending sections require explicit `--allow-pending`. Subtitle formats require valid segment timestamps. Export writes to stdout or creates a new file with `--output`.

Use `meetings show|transcript|summary|images` for details, raw and corrected transcripts, saved summaries and the image manifest. Use `topics`, `tags` and `status` for categories, labels and recording status. Queries return JSON. Errors go to stderr with a nonzero exit status.
