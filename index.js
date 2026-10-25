/**
 * Auto-discover project-level MCP servers declared in `.agents/mcp.json` and
 * mount them inside each agent session's Cordis scope, so servers apply only
 * to sessions working in that project and disconnect when the agent ends.
 *
 * The file uses the common `mcpServers` layout (Claude Code / Codex style):
 * entries with `command` become stdio servers, entries with `url` become
 * Streamable HTTP servers. Invalid entries are logged and skipped; a broken
 * server never blocks the others or the session.
 *
 * A Typert Remote service (`ctx.mcpAutoload`) exposes what each live session
 * mounted, with every registered tool's name, description, and parameter
 * schema, so the Web UI can render an inventory panel.
 *
 * @module dsh-mcp-autoload
 */

import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-autoload'

/** Upper bound for the discovered config file, guarding against giant files. */
const MAX_CONFIG_BYTES = 1_048_576

/** Valid `serverName` for the MCP client, below its public tool-name budget. */
const VALID_SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** Public tool-name prefix the MCP bridge registers under. */
const MCP_TOOL_PREFIX = 'mcp__'

// ---- Config ----

/**
 * Plugin configuration.
 */
export const Config = Schema.object({
  /** Path of the server manifest, absolute or relative to the project root. */
  configPath: Schema.string().default('.agents/mcp.json'),
  /** Directory entries that identify the project root while walking upward. */
  projectRootMarkers: Schema.array(Schema.string()).default(['.git']),
})

// ---- Per-agent mount record ----

/**
 * Typert Remote service exposing each live session's mounted MCP servers and
 * their registered tools. Reads tool schemas live at query time so re-syncs
 * (server-side tool-list changes) are reflected without bookkeeping.
 */
export class McpAutoloadService extends TypertRemoteService {
  /** Reads the tool registry and the live agent registry at query time. */
  static inject = ['agents', 'tools']

  /** Live agents' mount records keyed by agent object identity. */
  _agents = new Map()

  constructor(ctx) {
    super(ctx, 'mcpAutoload')
  }

  /** Record one agent's mounts (called by the plugin after mounting settles). */
  record(agent, mounts) {
    this._agents.set(agent, mounts)
  }

  /** Forget one agent (called from its disposal effect). */
  forget(agent) {
    this._agents.delete(agent)
  }

  /**
   * The `mcpAutoload/status` Remote invocation: one session's mounted servers
   * and every registered tool with name, description, and parameter schema.
   * User-level (profile-configured) servers appear alongside project ones,
   * marked by origin.
   */
  status(sessionId) {
    const agents = this.ctx.get('agents')
    const agent = agents?.get(sessionId)
    const recorded = agent === undefined ? undefined : this._agents.get(agent)
    const projectNames = new Set(recorded?.mounts.map(mount => mount.serverName) ?? [])
    const servers = []
    if (recorded !== undefined && agent !== undefined) {
      for (const mount of recorded.mounts) {
        servers.push(viewOf(mount, 'project', toolsOf(this.ctx, agent, mount.serverName)))
      }
    }
    // User-level: mcp__ tools visible to this agent whose server is not a project mount.
    if (agent !== undefined) {
      const seen = new Set(projectNames)
      for (const group of groupToolsByServer(this.ctx, agent)) {
        if (seen.has(group.serverName)) continue
        seen.add(group.serverName)
        servers.push(viewOf({
          serverName: group.serverName,
          origin: 'project',
          transport: 'unknown',
          target: '',
        }, 'user', group.tools))
      }
    }
    return {
      sessionId,
      manifestPath: recorded?.manifestPath ?? null,
      servers,
    }
  }
}

/** Read one agent's registered `mcp__<server>__*` tool views. */
function toolsOf(ctx, agent, serverName) {
  const schemas = ctx.tools?.schemas(agent) ?? []
  const views = []
  for (const schema of schemas) {
    const name = typeof schema.name === 'string' ? schema.name : ''
    if (!name.startsWith(`${MCP_TOOL_PREFIX}${serverName}__`)) continue
    views.push({
      name,
      description: typeof schema.description === 'string' ? schema.description : '',
      parametersJson: JSON.stringify(schema.parameters ?? {}),
    })
  }
  return views.sort((left, right) => left.name < right.name ? -1 : 1)
}

/** Group one agent's registered mcp__ tools by server segment. */
function groupToolsByServer(ctx, agent) {
  const schemas = ctx.tools?.schemas(agent) ?? []
  const groups = new Map()
  for (const schema of schemas) {
    const name = typeof schema.name === 'string' ? schema.name : ''
    if (!name.startsWith(MCP_TOOL_PREFIX)) continue
    const rest = name.slice(MCP_TOOL_PREFIX.length)
    const sep = rest.indexOf('__')
    const serverName = sep === -1 ? '' : rest.slice(0, sep)
    // A bare `mcp__` name has no server segment — not a bridge registration.
    if (serverName === '' || !VALID_SERVER_NAME.test(serverName)) continue
    const group = groups.get(serverName) ?? []
    group.push({
      name,
      description: typeof schema.description === 'string' ? schema.description : '',
      parametersJson: JSON.stringify(schema.parameters ?? {}),
    })
    groups.set(serverName, group)
  }
  return [...groups.entries()]
    .map(([serverName, tools]) => ({ serverName, tools: tools.sort((left, right) => left.name < right.name ? -1 : 1) }))
    .sort((left, right) => left.serverName < right.serverName ? -1 : 1)
}

/** Compose one server view row. */
function viewOf(mount, origin, tools) {
  return {
    serverName: mount.serverName,
    origin,
    transport: mount.transport,
    target: mount.target,
    toolCount: tools.length,
    tools,
  }
}

// ---- Discovery helpers ----

/** Whether one path exists (file or directory); missing paths are not errors. */
async function pathExists(path, signal) {
  signal?.throwIfAborted()
  try {
    await stat(path)
    return true
  } catch (error) {
    signal?.throwIfAborted()
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return false
    throw error
  }
}

/**
 * Walk upward to the first directory containing a configured root marker.
 * Returns the start directory when no marker exists (matches DSH's
 * agent-instructions behavior).
 */
async function findProjectRoot(cwd, markers, signal) {
  let current = resolve(cwd)
  for (;;) {
    for (const marker of markers) {
      if (await pathExists(join(current, marker), signal)) return current
    }
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

/** Read and parse the manifest; returns undefined when it does not exist. */
async function readManifest(path, signal) {
  signal?.throwIfAborted()
  const info = await stat(path).catch((error) => {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return undefined
    throw error
  })
  if (info === undefined) return undefined
  if (info.size > MAX_CONFIG_BYTES) {
    throw new Error(`manifest exceeds ${MAX_CONFIG_BYTES} bytes: ${path}`)
  }
  return JSON.parse(await readFile(path, 'utf8'))
}

/** Validate the manifest shape and return its `mcpServers` record. */
function parseServers(raw, path) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${path}: root must be a JSON object`)
  }
  const servers = raw.mcpServers
  if (servers === undefined) throw new Error(`${path}: "mcpServers" field is missing`)
  if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) {
    throw new Error(`${path}: "mcpServers" must be an object`)
  }
  return servers
}

/** Produce a stable MCP tool namespace from a human-readable server name. */
function normalizeServerName(name) {
  if (name.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('invalid server name')
  }
  if (VALID_SERVER_NAME.test(name)) return name
  const slug = name.normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'server'
  const digest = createHash('sha256').update(name).digest('hex').slice(0, 8)
  return `${slug}_${digest}`.slice(0, 32)
}

/** Return a string record, or undefined when the value is absent. */
function optionalRecord(value, field) {
  if (value === undefined) return undefined
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`"${field}" must be an object`)
  }
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error(`"${field}.${key}" must be a string`)
    out[key] = item
  }
  return out
}

/** Return a string array, or undefined when the value is absent. */
function optionalStringArray(value, field) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`"${field}" must be an array`)
  return value.map((item, index) => {
    if (typeof item !== 'string') throw new Error(`"${field}[${index}]" must be a string`)
    return item
  })
}

/** One translated entry: the client config plus its display target. */

/**
 * Translate one `mcpServers` entry into an MCP client config, or `null` when
 * the entry is disabled. `command` selects stdio; `url` selects Streamable
 * HTTP. `type: 'sse'` is rejected because the DSH MCP client has no SSE
 * transport.
 */
function translateEntry(entry, serverName, sessionCwd) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('entry must be an object')
  }
  if (entry.disabled === true || entry.enabled === false) return null
  const declared = entry.type
  if (declared !== undefined && declared !== 'stdio' && declared !== 'http') {
    throw new Error(`transport type "${declared}" is not supported (stdio, http)`)
  }
  if (entry.url !== undefined) {
    if (typeof entry.url !== 'string' || !/^https?:\/\//i.test(entry.url)) {
      throw new Error('"url" must be an absolute http(s) URL')
    }
    const headers = optionalRecord(entry.headers, 'headers')
    return {
      config: McpClient.Config({
        transport: 'streamable-http',
        serverName,
        url: entry.url,
        ...(headers === undefined ? {} : { headers }),
      }),
      transport: 'streamable-http',
      target: entry.url,
    }
  }
  if (entry.command !== undefined) {
    if (typeof entry.command !== 'string' || entry.command.length === 0) {
      throw new Error('"command" must be a non-empty string')
    }
    const args = optionalStringArray(entry.args, 'args')
    const env = optionalRecord(entry.env, 'env')
    return {
      config: McpClient.Config({
        transport: 'stdio',
        serverName,
        command: entry.command,
        args: args ?? [],
        env: env ?? {},
        cwd: sessionCwd,
      }),
      transport: 'stdio',
      target: [entry.command, ...(args ?? [])].join(' '),
    }
  }
  throw new Error('entry needs "command" (stdio) or "url" (http)')
}

// ---- Plugin apply ----

/**
 * Mount every discovered server inside each new agent's scope and expose the
 * per-session inventory through the `mcpAutoload` Remote service.
 *
 * @param ctx - plugin context.
 * @param config - resolved plugin configuration.
 */
export async function apply(ctx, config) {
  // Service Provider — mounts the inventory service (a TypertRemoteService:
  // registering the Cordis service also binds it to the Typert Gateway).
  await ctx.plugin(McpAutoloadService)
  // Mounting opens an await window; a remount runs this whole path again.
  if (ctx.fiber.uid === null) return
  const service = ctx.get('mcpAutoload')

  ctx.on('agent/created', async ({ agent, signal }) => {
    const label = 'mcp-autoload'
    let recorded = false
    try {
      // Forget the record when the agent goes away (plugin unload does not
      // dispose agent.ctx effects by itself, so own the cleanup explicitly).
      const bound = agent
      agent.ctx.effect(() => () => service.forget(bound), `${label}.inventory`)
      const workingDirectory = ctx.get('workingDirectory')
      if (workingDirectory === undefined) {
        ctx.logger.warn(`${label}: no working-directory provider; project MCP discovery is inactive`)
        return
      }
      const sessionCwd = await workingDirectory.ensure(agent, signal)
      const projectRoot = await findProjectRoot(sessionCwd, config.projectRootMarkers, signal)
      const manifestPath = isAbsolute(config.configPath)
        ? config.configPath
        : join(projectRoot, config.configPath)
      const raw = await readManifest(manifestPath, signal)
      if (raw === undefined) return
      const servers = parseServers(raw, manifestPath)

      const settled = await Promise.allSettled(Object.entries(servers).map(async ([rawName, entry]) => {
        const serverName = normalizeServerName(rawName)
        const translation = translateEntry(entry, serverName, sessionCwd)
        if (translation === null) return null
        await agent.ctx.plugin(McpClient, translation.config)
        return {
          serverName,
          origin: 'project',
          transport: translation.transport,
          target: translation.target,
        }
      }))

      const mounts = []
      for (const [index, outcome] of settled.entries()) {
        const rawName = Object.keys(servers)[index]
        if (outcome.status === 'fulfilled') {
          if (outcome.value !== null) mounts.push(outcome.value)
        } else ctx.logger.error(`${label}: skipping "${rawName}" from ${manifestPath}: ${String(outcome.reason)}`)
      }
      service.record(agent, { manifestPath, mounts })
      recorded = true
      if (mounts.length > 0) {
        ctx.logger.info(`${label}: mounted ${mounts.map(mount => mount.serverName).join(', ')} from ${manifestPath}`)
      }
    } catch (error) {
      // Contained: a broken manifest or missing service never blocks the agent.
      ctx.logger.error(`${label}: discovery failed: ${String(error)}`)
      if (!recorded) service.record(agent, { manifestPath: null, mounts: [] })
    }
  })
}
