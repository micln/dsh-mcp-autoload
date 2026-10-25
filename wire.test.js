import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { MCP_AUTOLOAD_INVOCATIONS, MCP_SERVER_VIEW_JSON } from './wire.js'

test('browser and host Remote descriptors stay in sync', async () => {
  let factory
  const window = { __ModuleLoader__: { load: ({ factory: registered }) => { factory = registered } } }
  runInNewContext(await readFile(new URL('./client.js', import.meta.url), 'utf8'), { window })

  const plugin = factory(() => ({}))
  let remote
  await plugin.apply({
    effect() {},
    remote: { $mount: async (descriptor) => { remote = descriptor } },
    inject() {},
  })

  const toPlainJson = (value) => JSON.parse(JSON.stringify(value))
  const withoutSourceLocation = (items) => items.map((item) => {
    delete item.sourceLocation
    return item
  })
  const browserDescriptors = withoutSourceLocation(toPlainJson(remote.descriptors))
  const hostDescriptors = withoutSourceLocation(toPlainJson(MCP_AUTOLOAD_INVOCATIONS))
  assert.deepEqual(browserDescriptors, hostDescriptors)
  assert.deepEqual(toPlainJson(remote.descriptors[0].result.jsonSchema.properties.servers.items), toPlainJson(MCP_SERVER_VIEW_JSON))
  assert.deepEqual(JSON.parse(JSON.stringify(remote.descriptors[1].parameters.map(({ name }) => name))), ['sessionId', 'rawName', 'enabled'])
})
