---
name: control
description: Use when starting, checking, opening, force-releasing, or stopping the PhotoClub control console from Codex Desktop on macOS, Windows, or Linux.
---

# PhotoClub Control

Codex Desktop is the only system prerequisite. Never require a system Node.js, npm, pnpm, Python, image utility, package manager, administrator permission, or API key.

## Start

1. Resolve the repository root relative to this `SKILL.md`: ascend from `system/skills/control/` to the repository root. Do not assume the current directory or a user-specific path.
2. Call `codex_app__load_workspace_dependencies` and read its bundled Node.js, pnpm, and native-binary paths.
3. Run the bootstrap with those exact paths. Quote every path:

   ```bash
   "<bundled-node>" "<root>/system/tools/bootstrap.mjs" --root "<root>" --pnpm "<bundled-pnpm>" --native-bin "<bundled-native-bin>" --port 0 --open
   ```

4. Bootstrap detects dependencies, installs missing locked project dependencies locally, locates the Codex Desktop CLI, starts the server, and checks `/api/health` before returning.
5. Read the JSON result. Report `url`, `pid`, dependency installation status, and the detected runtime paths. A result with `ok: false` must be reported with its `stage` and `error`; do not bypass the failed check.

`--open` uses the operating system's default browser on macOS, Windows, and Linux. Do not substitute the Codex in-app browser for the official launch.

## Installation Rules

- Installation is limited to dependencies declared in the committed lockfile and written under the repository.
- Never invoke Homebrew, winget, apt, dnf, pacman, sudo, or global package installation.
- Reuse an already valid local installation; do not reinstall on every start.
- If installation cannot complete, stop and report the bootstrap `dependencies` error.

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
"<bundled-node>" "<root>/system/tools/bootstrap.mjs" --root "<root>" --pnpm "<bundled-pnpm>" --release
```

Stop the server:

```bash
"<bundled-node>" "<root>/system/tools/bootstrap.mjs" --root "<root>" --pnpm "<bundled-pnpm>" --stop
```

If the state file is missing, report that no managed control server is running. Do not kill unrelated Node or Codex processes.
