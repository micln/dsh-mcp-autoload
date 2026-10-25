# dsh-mcp-autoload

Auto-discover project-level MCP servers for DeepSeek Harness (DSH).

Place a `.agents/mcp.json` at your project root (the nearest ancestor with a
`.git` marker). Every DSH agent session whose working directory is inside that
project automatically mounts the declared servers; connections close when the
session ends. Servers from other projects never leak in.

English | [中文](README.zh.md)

## Install

Requires DSH `>=0.2.1-0 <0.3.0` and Node.js `^22.19.0 || >=24.0.0`. `dsh plugin`
forwards its arguments to pnpm inside the profile directory.

```sh
dsh plugin --profile web add dsh-mcp-autoload
```

The package declares `dsh.bundle.patch`, so the CLI registers it under the
profile's `dsh.profile.bundles` for you. Restart `dsh web` afterwards — the host
half loads at startup — then hard-refresh the browser (Cmd/Ctrl+Shift+R).

Working on the plugin from a local clone instead (the dependency is recorded as
a `link:`):

```sh
dsh plugin --profile web add /absolute/path/to/dsh-mcp-autoload
```

Update with `dsh plugin --profile web add dsh-mcp-autoload@latest`; uninstall with
`dsh plugin --profile web remove dsh-mcp-autoload`.

## Minimal example

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

## Full example

Four entries cover every field and both toggle spellings:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": { "PLAYWRIGHT_BROWSERS_PATH": "~/.cache/ms-playwright" }
    },
    "postgres_local": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer local-dev-token" }
    },
    "experimental_server": {
      "enabled": false,
      "command": "uvx",
      "args": ["some-experimental-mcp@latest"]
    },
    "legacy_server": {
      "disabled": true,
      "url": "http://old-mcp.internal/mcp"
    }
  }
}
```

## Field reference

| Field | Transport | Notes |
|---|---|---|
| `command` | stdio | Executable: a bare name resolved from `PATH` (`npx`, `uvx`) or an absolute path. Required for stdio |
| `args` | stdio | Optional string array, passed through without shell interpolation |
| `env` | stdio | Optional string map merged over the scrubbed child environment; explicit entries survive the scrub |
| `url` | Streamable HTTP | Absolute `http(s)://` URL. Required for HTTP |
| `headers` | Streamable HTTP | Optional string map of extra request headers |
| `type` | — | Optional; accepted values are `stdio` and `http`. `sse` is rejected with a log line |
| `disabled` / `enabled` | — | Optional; `disabled: true` or `enabled: false` skips the entry silently (both Claude Code and Codex spellings). The popover removes both fields to enable, or writes `disabled: true` to disable |

**Transport selection:** an entry with `url` mounts over Streamable HTTP;
otherwise `command` mounts a stdio child process whose working directory is
the session's cwd. An entry with neither is skipped with an error log.

**Server names.** A name matching `[A-Za-z0-9_-]{1,32}` passes through
unchanged (`postgres_local`, `experimental_server` stay as-is). Any other name — Chinese
characters, spaces, over-long — is normalized to a deterministic slug (the
same algorithm the DSH ACP bridge uses), e.g. `我的服务器` → `server_<hash>`.

**Tool names.** Each server's tools register for that session as
`mcp__<serverName>__<rawToolName>`, e.g. `mcp__playwright__browser_navigate`.

## Behavior

- **Per-session scope.** Each server mounts inside the agent's Cordis scope:
  tools apply to that session only, and connections close when the agent is
  disposed. Two sessions in different projects can use the same server name
  independently.
- **Startup.** Mounting happens during agent creation and awaits the initial
  connection, so tools are available in the first turn. Servers connect in
  parallel; one slow or broken server never blocks the others
  (`failOnStartupError` stays false). A server that fails to connect is
  skipped with an error log and the rest keep working.
- **In-session management.** The popover can enable/disable project MCP servers after explicit confirmation. It backs up the original JSON and atomically replaces it; tools are unloaded/reconnected in the current session. If reconnect fails, the config remains enabled and the popover allows retry.
- **User-level MCPs.** Profile-configured entries are listed but cannot be toggled here; only project manifest entries are writable.
- **No external hot reload.** The manifest is read once per session start (including resume). Manual edits require a new session to apply.
- **Plugin config** (in the patch row):

```yaml
- id: mcp-autoload
  name: dsh-mcp-autoload
  config:
    configPath: .agents/mcp.json   # absolute, or relative to the project root
    projectRootMarkers: ['.git']   # directory entries that mark the root
```

## Security

`.agents/mcp.json` entries are **executed** on session start. A cloned
repository containing this file gets to run arbitrary `command` lines on your
machine — the same trust level as an npm postinstall script. Only add this
file to projects you trust, and review it when cloning others'.

## Compatibility

Peer packages (`@deepseek-ai/cordis`, `@deepseek-ai/schemastery`,
`@deepseek-ai/dsh-mcp-client`) are provided by the DSH installation; the
bundle declares them only for version checks. Requires DSH >= 0.2.1-0 < 0.3.0.
