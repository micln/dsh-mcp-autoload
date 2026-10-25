import assert from 'node:assert/strict'
import { chmod, lstat, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setManifestServerEnabled } from './manifest.js'

const MANIFEST = '{\n  "mcpServers": {\n    "我的服务": { "command": "node" },\n    "other": { "command": "npx" }\n  }\n}\n'

test('toggle writes a reversible project manifest change', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-autoload-'))
  try {
    const path = join(dir, 'mcp.json')
    const original = '{\n  "mcpServers": {\n    "我的服务": { "command": "node", "enabled": false },\n    "other": { "command": "npx" }\n  }\n}\n'
    await writeFile(path, original, { mode: 0o640 })
    await chmod(path, 0o640)

    const disabled = await setManifestServerEnabled(path, '我的服务', false)
    const disabledJson = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(disabledJson.mcpServers['我的服务'].disabled, true)
    assert.equal('enabled' in disabledJson.mcpServers['我的服务'], false)
    assert.equal(disabledJson.mcpServers.other.command, 'npx')
    assert.equal(await readFile(disabled.backupPath, 'utf8'), original)
    assert.equal((await stat(path)).mode & 0o777, 0o640)
    assert.equal((await stat(disabled.backupPath)).mode & 0o777, 0o640)

    const enabled = await setManifestServerEnabled(path, '我的服务', true)
    const enabledJson = JSON.parse(await readFile(path, 'utf8'))
    assert.equal('disabled' in enabledJson.mcpServers['我的服务'], false)
    assert.equal('enabled' in enabledJson.mcpServers['我的服务'], false)
    assert.equal(enabled.entry.command, 'node')

    await assert.rejects(setManifestServerEnabled(path, 'missing', false), /missing or invalid/)
    await assert.rejects(setManifestServerEnabled(path, '__proto__', false), /missing or invalid/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('toggling through a symlink updates the target and keeps the link', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-autoload-'))
  try {
    const target = join(dir, 'mcp.json')
    const link = join(dir, 'mcp-link.json')
    await writeFile(target, MANIFEST)
    await symlink(target, link)

    await setManifestServerEnabled(link, 'other', false)

    assert.equal((await lstat(link)).isSymbolicLink(), true)
    const json = JSON.parse(await readFile(target, 'utf8'))
    assert.equal(json.mcpServers.other.disabled, true)
    assert.equal(json.mcpServers['我的服务'].command, 'node')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a lock left behind by a dead process is reclaimed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-autoload-'))
  try {
    const path = join(dir, 'mcp.json')
    await writeFile(path, MANIFEST)
    await writeFile(`${path}.lock`, '999999\n')

    const started = Date.now()
    await setManifestServerEnabled(path, 'other', false)

    assert.equal(JSON.parse(await readFile(path, 'utf8')).mcpServers.other.disabled, true)
    assert.ok(Date.now() - started < 5_000, 'the stale lock should be reclaimed, not waited out')
    assert.deepEqual((await readdir(dir)).filter(name => name.endsWith('.lock')), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('old manifest backups are pruned', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-autoload-'))
  try {
    const path = join(dir, 'mcp.json')
    await writeFile(path, MANIFEST)
    for (let round = 0; round < 8; round += 1) {
      await setManifestServerEnabled(path, 'other', round % 2 === 0)
    }

    const backups = (await readdir(dir)).filter(name => name.startsWith('mcp.json.bak-'))
    assert.equal(backups.length, 5)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
