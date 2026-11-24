---
name: delive-transcript-analyzer
description: Search local DeLive meetings and use the adopted transcript to prepare notes, summaries and follow-ups with the bundled delive CLI.
---

# DeLive Transcript Analyzer

Keep DeLive SQ running under the same OS account as the CLI. The private CLI connection works with Open API off and requires no token setup. On macOS the bundled CLI is at `/Applications/DeLive SQ.app/Contents/Resources/bin/delive`. Use the full path if the command is outside PATH.

1. Run `delive meetings search "meeting title"`. Use the returned ID and date to distinguish meetings.
2. Run `delive meetings versions ID` to identify the adopted version. For minutes use `delive meetings export ID --format md --purpose proofreading`, which preserves speaker labels, timestamps and revision provenance. Inspect any pending sections before explicitly including them with `--allow-pending`.
3. Run `delive meetings images ID` for the associated image manifest or `delive meetings summary ID` for the existing summary.
4. Attribute decisions and action items to the meeting and cite the transcript timestamps when needed.

Use `delive health` for connectivity, `delive status` for recording state, and `delive --help` for commands. Query results use JSON and exports write plain text to stdout. An unavailable meeting library or access error is reported through stderr and a nonzero exit status.
