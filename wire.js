/**
 * Wire vocabulary for the autoload panel: the snapshot type served over the
 * `mcpAutoload` Typert Remote namespace and its invocation descriptors,
 * shared by the host `./typert` manifest (and mirrored by `client.js`, which
 * inlines its own copy because the browser module loader is not ESM).
 *
 * Codecs here are hand-written identity codecs: they satisfy every structural
 * check (mode, typeSymbol, create) on both the typert-loader and the client
 * gateway mount, without a zod dependency. Wire validation is therefore
 * looser than a generated codec's — the panel tolerates that trade.
 *
 * @module dsh-mcp-autoload/wire
 */

/** One MCP tool's model-facing view (JSON Schema, for the codec projection). */
export const MCP_TOOL_VIEW_JSON = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    parametersJson: { type: 'string' },
  },
  required: ['name', 'description', 'parametersJson'],
  additionalProperties: false,
}

/** One mounted server's view (JSON Schema, for the codec projection). */
export const MCP_SERVER_VIEW_JSON = {
  type: 'object',
  properties: {
    serverName: { type: 'string' },
    origin: { type: 'string', enum: ['project', 'user'] },
    transport: { type: 'string' },
    target: { type: 'string' },
    toolCount: { type: 'number' },
    tools: { type: 'array', items: MCP_TOOL_VIEW_JSON },
  },
  required: ['serverName', 'origin', 'transport', 'target', 'toolCount', 'tools'],
  additionalProperties: false,
}

/** Snapshot served by `mcpAutoload/status` (JSON Schema, for the codec projection). */
export const MCP_AUTOLOAD_SNAPSHOT_JSON = {
  type: 'object',
  properties: {
    sessionId: { type: 'string' },
    manifestPath: { type: ['string', 'null'] },
    servers: { type: 'array', items: MCP_SERVER_VIEW_JSON },
  },
  required: ['sessionId', 'manifestPath', 'servers'],
  additionalProperties: false,
}

/**
 * Hand-written strict Typert codec: satisfies the loader's and the client
 * gateway's structural checks without a zod dependency.
 *
 * @param {string} typeSymbol - stable type identity for diagnostics.
 * @param {object} jsonSchema - JSON Schema projection of the wire value.
 */
export function strictCodec(typeSymbol, jsonSchema) {
  return {
    mode: 'strict',
    typeSymbol,
    jsonSchema,
    create: () => ({ parse: (value) => value }),
  }
}

/** The `mcpAutoload/status` invocation descriptor (host manifest + client Remote). */
export const MCP_AUTOLOAD_INVOCATIONS = Object.freeze([
  Object.freeze({
    id: 'dsh-mcp-autoload#mcpAutoload/status',
    service: 'mcpAutoload',
    namespace: 'mcpAutoload',
    method: 'status',
    invocation: Object.freeze({ kind: 'direct' }),
    parameters: Object.freeze([
      Object.freeze({
        name: 'sessionId',
        wire: 'sessionId',
        source: 'json',
        description: 'Session whose mounted MCP servers and tools are listed.',
        codec: strictCodec('dsh-mcp-autoload/types#SessionId', { type: 'string' }),
      }),
    ]),
    result: Object.freeze(strictCodec('dsh-mcp-autoload/types#McpAutoloadSnapshot', MCP_AUTOLOAD_SNAPSHOT_JSON)),
    sourceLocation: Object.freeze({ file: 'wire.js', line: 1, column: 1 }),
  }),
])
