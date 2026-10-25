/*
 * Wire types and Typert descriptors mirrored in client.js (the browser bundle
 * cannot import this host module). Keep both schemas and invocation lists in sync.
 */

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

export const MCP_SERVER_VIEW_JSON = {
  type: 'object',
  properties: {
    serverName: { type: 'string' },
    rawName: { type: 'string' },
    origin: { type: 'string', enum: ['project', 'user'] },
    enabled: { type: 'boolean' },
    mounted: { type: 'boolean' },
    mountError: { type: 'string' },
    transport: { type: 'string' },
    target: { type: 'string' },
    toolCount: { type: 'number' },
    tools: { type: 'array', items: MCP_TOOL_VIEW_JSON },
  },
  required: ['serverName', 'rawName', 'origin', 'enabled', 'mounted', 'mountError', 'transport', 'target', 'toolCount', 'tools'],
  additionalProperties: false,
}

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

export const MCP_AUTOLOAD_TOGGLE_RESULT_JSON = {
  type: 'object',
  properties: {
    changed: { type: 'boolean' },
    enabled: { type: 'boolean' },
    backupPath: { type: 'string' },
  },
  required: ['changed'],
  additionalProperties: false,
}

export function strictCodec(typeSymbol, jsonSchema) {
  return {
    mode: 'strict',
    typeSymbol,
    jsonSchema,
    create: () => ({ parse: (value) => value }),
  }
}

const sessionParameter = Object.freeze({
  name: 'sessionId',
  wire: 'sessionId',
  source: 'json',
  description: 'Session whose project MCP servers are managed.',
  codec: strictCodec('dsh-mcp-autoload/types#SessionId', { type: 'string' }),
})

const statusSessionParameter = Object.freeze({
  ...sessionParameter,
  description: 'Session whose mounted MCP servers and tools are listed.',
})

export const MCP_AUTOLOAD_INVOCATIONS = Object.freeze([
  Object.freeze({
    id: 'dsh-mcp-autoload#mcpAutoload/status',
    service: 'mcpAutoload',
    namespace: 'mcpAutoload',
    method: 'status',
    invocation: Object.freeze({ kind: 'direct' }),
    parameters: Object.freeze([statusSessionParameter]),
    result: Object.freeze(strictCodec('dsh-mcp-autoload/types#McpAutoloadSnapshot', MCP_AUTOLOAD_SNAPSHOT_JSON)),
    sourceLocation: Object.freeze({ file: 'wire.js', line: 1, column: 1 }),
  }),
  Object.freeze({
    id: 'dsh-mcp-autoload#mcpAutoload/setEnabled',
    service: 'mcpAutoload',
    namespace: 'mcpAutoload',
    method: 'setEnabled',
    invocation: Object.freeze({ kind: 'direct' }),
    parameters: Object.freeze([
      sessionParameter,
      Object.freeze({ name: 'rawName', wire: 'rawName', source: 'json', description: 'Original project manifest key.', codec: strictCodec('dsh-mcp-autoload/types#RawServerName', { type: 'string' }) }),
      Object.freeze({ name: 'enabled', wire: 'enabled', source: 'json', description: 'Whether the project MCP server should be enabled.', codec: strictCodec('dsh-mcp-autoload/types#Enabled', { type: 'boolean' }) }),
      Object.freeze({ name: 'confirmed', wire: 'confirmed', source: 'json', description: 'Explicit user confirmation for changing the project manifest.', codec: strictCodec('dsh-mcp-autoload/types#Confirmed', { type: 'boolean' }) }),
    ]),
    result: Object.freeze(strictCodec('dsh-mcp-autoload/types#McpAutoloadToggleResult', MCP_AUTOLOAD_TOGGLE_RESULT_JSON)),
    sourceLocation: Object.freeze({ file: 'wire.js', line: 1, column: 1 }),
  }),
])
