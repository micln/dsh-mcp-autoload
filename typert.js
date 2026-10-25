/**
 * Hand-written Typert HOST manifest for `dsh-mcp-autoload`, exported as
 * `./typert` so the harness's typert-loader registers the `mcpAutoload`
 * status invocation automatically when this plugin mounts.
 *
 * @module dsh-mcp-autoload/typert
 */

import { MCP_AUTOLOAD_INVOCATIONS } from './wire.js'

/** Host Typert manifest (validated by `@deepseek-ai/dsh-typert-loader`). */
export const TYPERT = Object.freeze({
  package: 'dsh-mcp-autoload',
  face: 'host',
  schemas: Object.freeze([]),
  invocations: MCP_AUTOLOAD_INVOCATIONS,
  model: Object.freeze({
    services: Object.freeze([]),
    events: Object.freeze([]),
    objects: Object.freeze([]),
  }),
})
