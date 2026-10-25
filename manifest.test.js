import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setManifestServerEnabled } from './manifest.js'

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
