---
name: control
description: Use when starting, locally deploying, opening, force-releasing, or stopping the photo generation control console in /Users/yohji/photo, including requests to open the HTML control page in the system default browser.
---

# 同框照相馆

Operate the local control page through the Node server. Do not use the Codex in-app browser for the official launch.

## Start

1. Verify `node --version` and `/Applications/Codex.app/Contents/Resources/codex --version` succeed.
2. Run in a managed PTY so the process remains attached to the current execution session:

   ```bash
   node web/server.mjs --root /Users/yohji/photo --port 0 --open
   ```

3. Read the first JSON output line and report its `pid` and `url`.
4. Confirm `/api/health` returns HTTP 200.

`--open` must invoke macOS `/usr/bin/open`, which opens the system default browser. Never substitute the Codex in-app browser.

## Security And Lifetime

- Use the locally signed-in Codex CLI identity for every generated task.
- Never read, request, store, or pass `OPENAI_API_KEY`.
- Keep `.control/server.json` private; it contains local process control data.
- Allow one controlling page at a time. A second page remains occupied and cannot operate controls.
- The controlling page sends a 5-second heartbeat only to maintain its exclusive lease. Closing, hiding, or leaving the page and missing heartbeats must never stop the service or cancel tasks.
- Stop the service only through the page's explicit shutdown button or the `--stop` command.
- During generation, keep the page locked except for task status and cancellation.

## Commands

Force-release a stale page lease without stopping the server:

```bash
node web/server.mjs --root /Users/yohji/photo --release
```

Stop the server:

```bash
node web/server.mjs --root /Users/yohji/photo --stop
```

If the state file is missing, report that no managed control server is running. Do not kill unrelated Node or Codex processes.
