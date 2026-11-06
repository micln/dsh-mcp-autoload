/**
 * Host-side behaviour tests for the non-blocking mount path in index.js.
 *
 * index.js imports three peers that DSH provides but this repository does not
 * install, so this file installs synchronous module hooks that swap exactly
 * those three specifiers for minimal stubs. Everything under test is the real
 * code: the `agent/created` listener, `discoverForAgent`, and
 * `McpAutoloadService.status`.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

/** Minimal stand-ins for the DSH peers index.js imports. */
const STUBS = new Map([
  ['@deepseek-ai/schemastery', `
    const node = () => new Proxy(function () {}, { get: () => () => node(), apply: () => node() })
    export default new Proxy({}, { get: () => () => node() })
  `],
  ['@deepseek-ai/dsh-typert-protocol', `
    export class TypertRemoteService {
      constructor(ctx, name) {
        this.ctx = ctx
        ctx.set(name, this)
      }
    }
  `],
  ['@deepseek-ai/dsh-mcp-client', `
    export const Config = (config) => ({ ...config })
  `],
])

const hooksSupported = typeof registerHooks === 'function'
if (hooksSupported) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (STUBS.has(specifier)) return { url: `stub:${specifier}`, shortCircuit: true }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      const specifier = url.startsWith('stub:') ? url.slice('stub:'.length) : undefined
      if (specifier !== undefined && STUBS.has(specifier)) {
        return { format: 'module', source: STUBS.get(specifier), shortCircuit: true }
      }
      return nextLoad(url, context)
    },
  })
}

/** Rejections that fire-and-forget discovery must never leak. */
const leakedRejections = []
process.on('unhandledRejection', (reason) => { leakedRejections.push(reason) })

const skipWithoutHooks = (t) => {
  if (hooksSupported) return false
  t.skip('module.registerHooks is unavailable on this Node')
  return true
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

async function settle() {
  await flush()
  await flush()
}

async function waitUntil(predicate, description, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

async function assertNoLeakedRejections() {
  await settle()
  assert.deepEqual(leakedRejections, [])
}

/** A fake agent whose ctx effect/disposer pair mirrors the real agent scope. */
function createAgent(id, options = {}) {
  const disposers = []
  const agent = {
    id,
    ctx: {
      fiber: { uid: 1 },
      effect: (callback) => {
        const disposer = callback()
        disposers.push(disposer)
        return disposer
      },
      // The client config travels as the second argument, so a test can tell
      // one server's handshake from another's.
      plugin: (...args) => (options.mount === undefined
        ? Promise.resolve({ dispose: async () => {} })
        : options.mount(...args)),
    },
  }
  agent.dispose = () => {
    for (const disposer of disposers.splice(0)) {
      if (typeof disposer === 'function') disposer()
    }
  }
  return agent
}

/** Boot the real plugin against a recording fake context. */
async function createFixture() {
  const plugin = await import('./index.js')
  const services = new Map()
  const handlers = new Map()
  const log = []
  const agents = new Map()
  let ensure = () => Promise.reject(new Error('no working directory'))
  // `status` reads tool schemas live; tests that care seed a few here.
  let toolSchemas = []

  const ctx = {
    fiber: { uid: 1 },
    tools: { schemas: () => toolSchemas },
    logger: {
      info: (...args) => log.push(`info ${args.map(String).join(' ')}`),
      warn: (...args) => log.push(`warn ${args.map(String).join(' ')}`),
      error: (...args) => log.push(`error ${args.map(String).join(' ')}`),
    },
    set: (name, value) => services.set(name, value),
    get: (name) => {
      if (name === 'agents') return { get: (id) => agents.get(id), list: () => [...agents.values()] }
      if (name === 'workingDirectory') return { ensure: (agent, signal) => ensure(agent, signal) }
      return services.get(name)
    },
    on: (event, listener) => handlers.set(event, listener),
    plugin: async (target) => {
      if (typeof target === 'function') new target(ctx)
      return { dispose: async () => {} }
    },
    effect: () => {},
  }

  await plugin.apply(ctx, { configPath: '.agents/mcp.json', projectRootMarkers: ['.git'] })
  return {
    log,
    agents,
    service: services.get('mcpAutoload'),
    listener: handlers.get('agent/created'),
    setEnsure: (next) => { ensure = next },
    setToolSchemas: (next) => { toolSchemas = next },
    announce: (agent, signal) => {
      agents.set(agent.id, agent)
      return handlers.get('agent/created')({ agent, signal })
    },
  }
}

async function makeProject(manifest) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-autoload-'))
  await mkdir(join(root, '.git'))
  if (manifest !== undefined) {
    await mkdir(join(root, '.agents'))
    await writeFile(join(root, '.agents', 'mcp.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest))
  }
  return root
}

test('the creation listener returns synchronously and reports loading until discovery settles', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject(undefined)
  let releaseEnsure
  fixture.setEnsure(() => new Promise((resolve) => { releaseEnsure = resolve }))
  const agent = createAgent('session-1')

  try {
    const returned = fixture.announce(agent)

    // The kernel awaits listeners serially: a returned Promise here would block
    // the new session until the MCP handshake finished.
    assert.equal(returned, undefined)
    // beginDiscovery runs before the first await, so this race is not observable.
    assert.equal(fixture.service.status('session-1').loading, true)
    assert.deepEqual(fixture.service.status('session-1').servers, [])

    await settle()
    // Still pending after the await window: `loading` must not have flickered.
    assert.equal(fixture.service.status('session-1').loading, true)

    releaseEnsure(root)
    await waitUntil(() => fixture.service.status('session-1').loading === false, 'loading to clear')
    assert.equal(fixture.service.status('session-1').manifestPath, null)
    assert.deepEqual(fixture.service.status('session-1').servers, [])
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('loading stays true while the handshake is in flight, then flips false with the mount', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject({ mcpServers: { alpha: { command: 'echo', args: ['hi'] } } })
  let mountRequested = false
  let releaseMount
  const gate = new Promise((resolve) => { releaseMount = () => resolve({ dispose: async () => {} }) })
  fixture.setEnsure(() => root)
  const agent = createAgent('session-2', {
    mount: () => {
      mountRequested = true
      return gate
    },
  })

  try {
    fixture.announce(agent)
    await waitUntil(() => mountRequested, 'the MCP mount to be requested')

    // The row exists before its handshake settles: the panel can already list
    // the server, it just cannot show it as mounted yet.
    const during = fixture.service.status('session-2')
    assert.equal(during.loading, true)
    assert.deepEqual(
      during.servers.map(({ serverName, rawName, origin, enabled, mounted, mountError, transport, target, toolCount }) =>
        ({ serverName, rawName, origin, enabled, mounted, mountError, transport, target, toolCount })),
      [{
        serverName: 'alpha', rawName: 'alpha', origin: 'project', enabled: true,
        mounted: false, mountError: '', transport: 'stdio', target: 'echo hi', toolCount: 0,
      }],
    )

    releaseMount()
    await waitUntil(() => fixture.service.status('session-2').loading === false, 'loading to clear')
    const after = fixture.service.status('session-2')

    assert.equal(after.manifestPath, join(root, '.agents', 'mcp.json'))
    assert.deepEqual(
      after.servers.map(({ serverName, rawName, origin, mounted, transport, target, toolCount }) =>
        ({ serverName, rawName, origin, mounted, transport, target, toolCount })),
      [{ serverName: 'alpha', rawName: 'alpha', origin: 'project', mounted: true, transport: 'stdio', target: 'echo hi', toolCount: 0 }],
    )
    assert.deepEqual(fixture.log.filter((line) => line.startsWith('error')), [])
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an aborted discovery is silent and still clears loading', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject({ mcpServers: {} })
  const abortError = new DOMException('The operation was aborted.', 'AbortError')
  assert.equal(abortError.name, 'AbortError')
  fixture.setEnsure(() => root)
  const agent = createAgent('session-3')

  try {
    fixture.announce(agent, { throwIfAborted: () => { throw abortError } })
    await waitUntil(() => fixture.service.status('session-3').loading === false, 'loading to clear')

    // A cancelled session is not a failure: no error line, no record, no leak.
    assert.deepEqual(fixture.log.filter((line) => line.startsWith('error')), [])
    assert.equal(fixture.service.status('session-3').manifestPath, null)
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('disposing an agent clears its in-flight discovery', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  fixture.setEnsure(() => new Promise(() => {}))
  const agent = createAgent('session-4')

  fixture.announce(agent)
  await settle()
  assert.equal(fixture.service.status('session-4').loading, true)
  assert.equal(fixture.service._pending.has(agent), true)

  agent.dispose()

  assert.equal(fixture.service._pending.has(agent), false)
  assert.equal(fixture.service._agents.has(agent), false)
  // A disposed session must not keep reporting `loading` forever.
  assert.equal(fixture.service.status('session-4').loading, false)
  await assertNoLeakedRejections()
})

test('a discovery that settles after its session was disposed is not recorded', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject({ mcpServers: { alpha: { command: 'echo' } } })
  fixture.setEnsure(() => root)
  // Observation point: proves the abandoned discovery really reached `record()`
  // instead of the assertion passing because it never finished.
  const recordAttempts = []
  const record = fixture.service.record.bind(fixture.service)
  fixture.service.record = (agent, mounts) => {
    recordAttempts.push(agent)
    record(agent, mounts)
  }

  let releaseMount
  let mountRequested = false
  const gate = new Promise((resolve) => { releaseMount = () => resolve({ dispose: async () => {} }) })
  const disposed = createAgent('session-7', {
    mount: () => {
      mountRequested = true
      return gate
    },
  })

  try {
    fixture.announce(disposed)
    await waitUntil(() => mountRequested, 'the MCP mount to be requested')

    // The session goes away mid-handshake: the registry drops the agent and the
    // disposal effect forgets the (still empty) record.
    fixture.agents.delete('session-7')
    disposed.dispose()
    assert.equal(fixture.service._agents.has(disposed), false)
    assert.equal(fixture.service._pending.has(disposed), false)

    // Control: a live agent is recorded as usual after its mount settles.
    const live = createAgent('session-8')
    fixture.announce(live)
    await waitUntil(() => fixture.service.status('session-8').loading === false, 'the live agent to be recorded')
    assert.equal(fixture.service._agents.has(live), true)
    assert.deepEqual(fixture.service.status('session-8').servers.map(({ serverName, mounted }) => [serverName, mounted]), [['alpha', true]])

    // Rebuilt session: same id, new agent object. The abandoned discovery of the
    // old agent must not be mistaken for it.
    const rebuilt = createAgent('session-7')
    fixture.announce(rebuilt)
    await waitUntil(() => fixture.service.status('session-7').loading === false, 'the rebuilt session to be recorded')
    assert.equal(fixture.service._agents.has(rebuilt), true)
    assert.equal(fixture.service._agents.size, 2)

    releaseMount()
    await waitUntil(() => recordAttempts.includes(disposed), 'the abandoned discovery to attempt a record')
    await settle()

    // Without the registry-identity check in `record()`, this late completion
    // would re-add the dead agent and hold it forever: the map is keyed by
    // agent identity and only disposal removes an entry.
    assert.equal(fixture.service._agents.has(disposed), false)
    assert.equal(fixture.service._agents.size, 2)
    assert.equal(fixture.service._pending.size, 0)
    assert.equal(fixture.service._pending.has(disposed), false)
    // `status` for that id still reports the rebuilt agent's own record.
    assert.deepEqual(fixture.service.status('session-7').servers.map(({ serverName, mounted }) => [serverName, mounted]), [['alpha', true]])
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a failing discovery is contained, logged, and clears loading', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  fixture.setEnsure(() => { throw new Error('boom') })
  const agent = createAgent('session-5')

  fixture.announce(agent)
  await waitUntil(() => fixture.service.status('session-5').loading === false, 'loading to clear')

  const errors = fixture.log.filter((line) => line.startsWith('error'))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /discovery failed: Error: boom/)
  // Contained means the session still gets a settled (empty) record.
  assert.equal(fixture.service.status('session-5').manifestPath, null)
  await assertNoLeakedRejections()
})

test('a rejection escaping discovery is contained by the listener', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject(undefined)
  fixture.setEnsure(() => root)
  const original = fixture.service.endDiscovery
  // Inject the only failure the listener's own `.catch` can still see.
  fixture.service.endDiscovery = () => { throw new Error('endDiscovery exploded') }
  const agent = createAgent('session-6')

  try {
    fixture.announce(agent)
    await waitUntil(
      () => fixture.log.some((line) => line.includes('discovery for agent "session-6" failed')),
      'the listener catch to log the escaping rejection',
    )
    assert.match(fixture.log.find((line) => line.includes('discovery for agent "session-6" failed')), /endDiscovery exploded/)
    await assertNoLeakedRejections()
  } finally {
    fixture.service.endDiscovery = original
    await rm(root, { recursive: true, force: true })
  }
})

test('a session with no live agent reports loading and an empty inventory', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()

  assert.deepEqual(fixture.service.status('missing'), {
    sessionId: 'missing',
    manifestPath: null,
    loading: true,
    servers: [],
  })
  await assertNoLeakedRejections()
})

test('status lists every declared server while all handshakes are still in flight', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject({
    mcpServers: {
      alpha: { command: 'echo', args: ['a'] },
      beta: { command: 'echo', args: ['b'] },
      gamma: { command: 'echo', disabled: true },
    },
  })
  const started = new Set()
  const gates = new Map()
  fixture.setEnsure(() => root)
  const agent = createAgent('session-9', {
    mount: (_module, config) => {
      started.add(config.serverName)
      return new Promise((resolve) => { gates.set(config.serverName, () => resolve({ dispose: async () => {} })) })
    },
  })

  try {
    fixture.announce(agent)
    await waitUntil(() => started.size === 2, 'both enabled handshakes to start')

    // No handshake has settled, yet the whole manifest is already listed: the
    // panel has rows to render instead of a bare spinner. Disabled entries are
    // listed too, so a toggle has something to flip.
    const during = fixture.service.status('session-9')
    assert.equal(during.loading, true)
    assert.deepEqual(
      during.servers.map(({ serverName, rawName, enabled, mounted, mountError }) =>
        ({ serverName, rawName, enabled, mounted, mountError })),
      [
        { serverName: 'alpha', rawName: 'alpha', enabled: true, mounted: false, mountError: '' },
        { serverName: 'beta', rawName: 'beta', enabled: true, mounted: false, mountError: '' },
        { serverName: 'gamma', rawName: 'gamma', enabled: false, mounted: false, mountError: '' },
      ],
    )

    gates.get('alpha')()
    gates.get('beta')()
    await waitUntil(() => fixture.service.status('session-9').loading === false, 'loading to clear')
    assert.deepEqual(fixture.service.status('session-9').servers.map(({ serverName, enabled, mounted }) =>
      [serverName, enabled, mounted]), [
      ['alpha', true, true],
      ['beta', true, true],
      ['gamma', false, false],
    ])
    assert.deepEqual(fixture.log.filter((line) => line.startsWith('error')), [])
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a row reports mounted as soon as its own handshake settles', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject({ mcpServers: { alpha: { command: 'echo' }, beta: { command: 'echo' } } })
  fixture.setEnsure(() => root)
  fixture.setToolSchemas([{ name: 'mcp__beta__ping', description: 'ping', parameters: { type: 'object' } }])
  let alphaStarted = false
  let releaseAlpha
  const agent = createAgent('session-10', {
    mount: (_module, config) => {
      if (config.serverName === 'beta') return Promise.resolve({ dispose: async () => {} })
      alphaStarted = true
      return new Promise((resolve) => { releaseAlpha = () => resolve({ dispose: async () => {} }) })
    },
  })

  try {
    fixture.announce(agent)
    await waitUntil(() => alphaStarted, 'the alpha handshake to start')
    await waitUntil(
      () => fixture.service.status('session-10').servers.find((server) => server.serverName === 'beta')?.mounted === true,
      'the beta row to report mounted',
    )

    // Waiting for every server would keep beta hidden behind alpha's handshake.
    const during = fixture.service.status('session-10')
    assert.equal(during.loading, true)
    assert.equal(during.servers.find((server) => server.serverName === 'alpha').mounted, false)
    const beta = during.servers.find((server) => server.serverName === 'beta')
    assert.equal(beta.mounted, true)
    // Tools are read live: the settled row already exposes beta's tools.
    assert.equal(beta.toolCount, 1)
    assert.deepEqual(beta.tools.map((tool) => tool.name), ['mcp__beta__ping'])

    releaseAlpha()
    await waitUntil(() => fixture.service.status('session-10').loading === false, 'loading to clear')
    assert.deepEqual(fixture.service.status('session-10').servers.map(({ serverName, mounted }) =>
      [serverName, mounted]), [['alpha', true], ['beta', true]])
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a placeholder row is the same row setEnabled keeps updating', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject({ mcpServers: { alpha: { command: 'echo' }, gamma: { command: 'echo', enabled: false } } })
  const started = []
  fixture.setEnsure(() => root)
  const agent = createAgent('session-12', {
    mount: (_module, config) => {
      started.push(config.serverName)
      return Promise.resolve({ dispose: async () => {} })
    },
  })

  try {
    fixture.announce(agent)
    await waitUntil(() => fixture.service.status('session-12').loading === false, 'loading to clear')
    // The disabled entry is listed, so the panel can offer to enable it.
    assert.deepEqual(
      fixture.service.status('session-12').servers.map(({ serverName, enabled, mounted }) => [serverName, enabled, mounted]),
      [['alpha', true, true], ['gamma', false, false]],
    )

    const result = await fixture.service.setEnabled('session-12', 'gamma', true)
    assert.equal(result.changed, true)
    // `setEnabled` rewrites the very row the incremental updates fill in, so the
    // newly mounted server shows up without a second discovery pass.
    assert.deepEqual(
      fixture.service.status('session-12').servers.map(({ serverName, enabled, mounted }) => [serverName, enabled, mounted]),
      [['alpha', true, true], ['gamma', true, true]],
    )
    assert.deepEqual(started, ['alpha', 'gamma'])
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a failed handshake records its error on its own row only', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject({ mcpServers: { alpha: { command: 'echo' }, beta: { command: 'echo' } } })
  fixture.setEnsure(() => root)
  /** A fiber-like thenable that rejects on await, as a failed plugin does. */
  const failingFiber = (message) => {
    const promise = Promise.reject(new Error(message))
    promise.catch(() => {})
    return { then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected), dispose: async () => {} }
  }
  const agent = createAgent('session-11', {
    mount: (_module, config) => (config.serverName === 'beta'
      ? Promise.resolve({ dispose: async () => {} })
      : failingFiber('alpha handshake failed')),
  })

  try {
    fixture.announce(agent)
    await waitUntil(() => fixture.service.status('session-11').loading === false, 'loading to clear')

    const after = fixture.service.status('session-11')
    const alpha = after.servers.find((server) => server.serverName === 'alpha')
    const beta = after.servers.find((server) => server.serverName === 'beta')
    assert.equal(alpha.mounted, false)
    assert.match(alpha.mountError, /alpha handshake failed/)
    assert.equal(beta.mounted, true)
    assert.equal(beta.mountError, '')

    const errors = fixture.log.filter((line) => line.startsWith('error'))
    assert.equal(errors.length, 1)
    assert.match(errors[0], /skipping "alpha"/)
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a late failure from a disposed agent does not write into the rebuilt session row', async (t) => {
  if (skipWithoutHooks(t)) return
  const fixture = await createFixture()
  const root = await makeProject({ mcpServers: { alpha: { command: 'echo' } } })
  fixture.setEnsure(() => root)

  let oldMountRequested = false
  let rejectOldMount
  const oldHandshake = new Promise((_resolve, reject) => { rejectOldMount = reject })
  // A fiber-like thenable that only fails once a test decides to reject it.
  const oldFiber = {
    then: (onFulfilled, onRejected) => oldHandshake.then(onFulfilled, onRejected),
    dispose: async () => {},
  }
  const disposed = createAgent('session-13', {
    mount: () => {
      oldMountRequested = true
      return oldFiber
    },
  })

  try {
    fixture.announce(disposed)
    await waitUntil(() => oldMountRequested, 'the abandoned MCP mount to be requested')
    // The placeholder row is recorded before the handshake starts, so this also
    // proves the abandoned discovery already reached `record()`.
    assert.equal(fixture.service.status('session-13').loading, true)
    assert.deepEqual(
      fixture.service.status('session-13').servers.map(({ serverName, mounted }) => [serverName, mounted]),
      [['alpha', false]],
    )

    // The session goes away mid-handshake: the registry drops the agent and the
    // disposal effect forgets its record.
    fixture.agents.delete('session-13')
    disposed.dispose()
    assert.equal(fixture.service._agents.has(disposed), false)

    // Tool schemas are read live at query time: seeding one here makes the
    // healthy row expose a tool, so a row overwritten by the dead agent's
    // failure is unmistakable.
    fixture.setToolSchemas([{ name: 'mcp__alpha__ping', description: 'ping', parameters: { type: 'object' } }])

    // It comes back as a NEW agent object with the same id, mounting fine.
    const rebuilt = createAgent('session-13')
    fixture.announce(rebuilt)
    await waitUntil(() => fixture.service.status('session-13').loading === false, 'the rebuilt session to settle')
    assert.equal(fixture.service._agents.has(rebuilt), true)
    assert.deepEqual(
      fixture.service.status('session-13').servers.map(({ serverName, origin, mounted, mountError, toolCount }) =>
        ({ serverName, origin, mounted, mountError, toolCount })),
      [{ serverName: 'alpha', origin: 'project', mounted: true, mountError: '', toolCount: 1 }],
    )

    // Only now does the abandoned handshake fail. Its error path still calls
    // `updateMount(disposed, ...)`, which must not reach the rebuilt session's
    // row just because the id matches: the guard compares agent identity.
    rejectOldMount(new Error('handshake exploded'))
    await waitUntil(
      () => fixture.log.some((line) => line.startsWith('error') && line.includes('handshake exploded')),
      'the abandoned failure to be logged',
    )
    await settle()

    assert.deepEqual(
      fixture.service.status('session-13').servers.map(({ serverName, origin, mounted, mountError, toolCount }) =>
        ({ serverName, origin, mounted, mountError, toolCount })),
      [{ serverName: 'alpha', origin: 'project', mounted: true, mountError: '', toolCount: 1 }],
    )
    assert.deepEqual(
      fixture.service.status('session-13').servers[0].tools.map((tool) => tool.name),
      ['mcp__alpha__ping'],
    )
    // The dead agent is not resurrected by its own late completion.
    assert.equal(fixture.service._agents.has(disposed), false)
    assert.equal(fixture.service._agents.size, 1)
    assert.equal(fixture.service._pending.size, 0)
    const errors = fixture.log.filter((line) => line.startsWith('error'))
    assert.equal(errors.length, 1)
    assert.match(errors[0], /skipping "alpha"/)
    await assertNoLeakedRejections()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
