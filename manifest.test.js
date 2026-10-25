import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, lstat, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { setManifestServerEnabled } from './manifest.js'

const MANIFEST = '{\n  "mcpServers": {\n    "我的服务": { "command": "node" },\n    "other": { "command": "npx" }\n  }\n}\n'
const BACKUP_NAME = /\.bak-\d{13}-[0-9a-f]{8}$/

/** Spawn a child, wait for it to exit, and hand back its now-dead pid. */
function deadPid() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', () => resolve(child.pid))
  })
}

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
    await writeFile(`${path}.lock`, `${await deadPid()} 00000000-0000-0000-0000-000000000000\n`)

    const started = Date.now()
    await setManifestServerEnabled(path, 'other', false)

    assert.equal(JSON.parse(await readFile(path, 'utf8')).mcpServers.other.disabled, true)
    assert.ok(Date.now() - started < 5_000, 'the stale lock should be reclaimed, not waited out')
    assert.deepEqual((await readdir(dir)).filter(name => name.includes('.lock')), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a lock held by a live process is never stolen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-autoload-'))
  try {
    const path = join(dir, 'mcp.json')
    await writeFile(path, MANIFEST)
    await writeFile(`${path}.lock`, `${process.pid} live-owner\n`)

    const outcome = await Promise.race([
      setManifestServerEnabled(path, 'other', false).then(() => 'toggled', () => 'failed'),
      delay(500).then(() => 'waited'),
    ])

    assert.equal(outcome, 'waited')
    await rm(`${path}.lock`, { force: true })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('old backups are pruned while user files and the reported backup survive', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-mcp-autoload-'))
  try {
    const path = join(dir, 'mcp.json')
    await writeFile(path, MANIFEST)
    const decoys = ['mcp.json.bak-manual-notes', 'mcp.json.bak-0-important-notes']
    for (const name of decoys) await writeFile(join(dir, name), 'keep me\n')

    let reported
    for (let round = 0; round < 8; round += 1) {
      reported = await setManifestServerEnabled(path, 'other', round % 2 === 0)
    }

    const names = await readdir(dir)
    assert.equal(names.filter(name => BACKUP_NAME.test(name)).length, 5)
    for (const name of decoys) {
      assert.equal(names.includes(name), true, `${name} must not be pruned`)
      assert.equal(await readFile(join(dir, name), 'utf8'), 'keep me\n')
    }
    assert.equal(names.includes(basename(reported.backupPath)), true, 'the reported backup must still exist')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
