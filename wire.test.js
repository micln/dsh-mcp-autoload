import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { MCP_AUTOLOAD_INVOCATIONS, MCP_AUTOLOAD_SNAPSHOT_JSON, MCP_SERVER_VIEW_JSON } from './wire.js'

/** Boot client.js in a bare vm and return the descriptors it mounts. */
async function loadBrowserDescriptors() {
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
  return remote.descriptors
}

const toPlainJson = (value) => JSON.parse(JSON.stringify(value))
const withoutSourceLocation = (items) => items.map((item) => {
  delete item.sourceLocation
  return item
})

test('browser and host Remote descriptors stay in sync', async () => {
  const descriptors = await loadBrowserDescriptors()

  const browserDescriptors = withoutSourceLocation(toPlainJson(descriptors))
  const hostDescriptors = withoutSourceLocation(toPlainJson(MCP_AUTOLOAD_INVOCATIONS))
  assert.deepEqual(browserDescriptors, hostDescriptors)
  assert.deepEqual(toPlainJson(descriptors[0].result.jsonSchema.properties.servers.items), toPlainJson(MCP_SERVER_VIEW_JSON))
  assert.deepEqual(JSON.parse(JSON.stringify(descriptors[1].parameters.map(({ name }) => name))), ['sessionId', 'rawName', 'enabled'])
})

test('the status snapshot schema carries a required boolean loading flag', async () => {
  const descriptors = await loadBrowserDescriptors()
  const browserSnapshot = toPlainJson(descriptors[0].result.jsonSchema)
  const hostSnapshot = toPlainJson(MCP_AUTOLOAD_SNAPSHOT_JSON)

  // The UI stops retrying on `!loading`, so a snapshot without the field (or
  // without it in `required`) would silently read as "discovery finished".
  for (const [side, schema] of [['host', hostSnapshot], ['browser', browserSnapshot]]) {
    assert.equal(schema.properties.loading.type, 'boolean', `${side} snapshot must declare loading: boolean`)
    assert.ok(schema.required.includes('loading'), `${side} snapshot must require loading`)
    assert.deepEqual(schema.required, ['sessionId', 'manifestPath', 'loading', 'servers'], `${side} required list drifted`)
  }
})

test('the browser snapshot mirror is verbatim identical to the host schema', async () => {
  const descriptors = await loadBrowserDescriptors()
  const browserSnapshot = JSON.stringify(toPlainJson(descriptors[0].result.jsonSchema))
  const hostSnapshot = JSON.stringify(toPlainJson(MCP_AUTOLOAD_SNAPSHOT_JSON))

  // Stronger than `deepEqual`: the serialized text includes key order, so a
  // mirror edited on one side only can never pass. Reorder both sides together.
  assert.equal(browserSnapshot, hostSnapshot)
})

test('both sides decode a status snapshot through the same codec', async () => {
  const descriptors = await loadBrowserDescriptors()
  const sample = { sessionId: 'session-1', manifestPath: null, loading: true, servers: [] }

  // `toPlainJson` drops functions, so the descriptor comparison above cannot
  // see a codec that exists on one side only; run both codecs on one payload.
  const decode = (descriptor) => descriptor.result.create().parse(sample)
  assert.deepEqual(decode(descriptors[0]), sample)
  assert.deepEqual(decode(MCP_AUTOLOAD_INVOCATIONS[0]), sample)
  assert.deepEqual(decode(descriptors[0]), decode(MCP_AUTOLOAD_INVOCATIONS[0]))
})
