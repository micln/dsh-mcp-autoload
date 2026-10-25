import { randomUUID } from 'node:crypto'
import { chmod, copyFile, lstat, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const MAX_CONFIG_BYTES = 1_048_576
const LOCK_TIMEOUT_MS = 10_000

/** Update one project MCP entry under a lock, keeping a backup and atomic rename. */
export async function setManifestServerEnabled(path, rawName, enabled) {
  if (typeof rawName !== 'string' || rawName.length === 0 || typeof enabled !== 'boolean') {
    throw new Error('invalid MCP toggle request')
  }

  const lockPath = `${path}.lock`
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  let lock
  while (lock === undefined) {
    try {
      lock = await open(lockPath, 'wx', 0o600)
      await lock.writeFile(`${process.pid}\n`)
    } catch (error) {
      if (lock !== undefined) {
        await lock.close().catch(() => {})
        await rm(lockPath, { force: true })
        throw error
      }
      if (error?.code !== 'EEXIST') throw error
      if (Date.now() >= deadline) throw new Error(`timed out waiting for manifest lock: ${lockPath}`)
      await delay(40)
    }
  }

  try {
    const fileInfo = await lstat(path)
    if (!fileInfo.isFile()) throw new Error('MCP manifest must be a regular file, not a symlink')
    if (fileInfo.size > MAX_CONFIG_BYTES) throw new Error(`manifest exceeds ${MAX_CONFIG_BYTES} bytes: ${path}`)

    const original = await readFile(path, 'utf8')
    if (Buffer.byteLength(original, 'utf8') > MAX_CONFIG_BYTES) throw new Error(`manifest exceeds ${MAX_CONFIG_BYTES} bytes: ${path}`)
    const manifest = JSON.parse(original)
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)
      || manifest.mcpServers === null || typeof manifest.mcpServers !== 'object' || Array.isArray(manifest.mcpServers)) {
      throw new Error('manifest must contain an "mcpServers" object')
    }
    if (!Object.hasOwn(manifest.mcpServers, rawName)) {
      throw new Error(`MCP server "${rawName}" is missing or invalid in the manifest`)
    }
    const entry = manifest.mcpServers[rawName]
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`MCP server "${rawName}" is missing or invalid in the manifest`)
    }

    if (enabled) {
      delete entry.disabled
      delete entry.enabled
    } else {
      delete entry.enabled
      entry.disabled = true
    }

    const content = `${JSON.stringify(manifest, null, 2)}\n`
    if (Buffer.byteLength(content, 'utf8') > MAX_CONFIG_BYTES) throw new Error(`updated manifest exceeds ${MAX_CONFIG_BYTES} bytes: ${path}`)
    const backupPath = `${path}.bak-${Date.now()}-${randomUUID().slice(0, 8)}`
    await copyFile(path, backupPath)
    await chmod(backupPath, fileInfo.mode & 0o777)
    const backup = await readFile(backupPath, 'utf8')
    if (backup !== original) throw new Error(`manifest backup verification failed: ${backupPath}`)
    const tempPath = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(tempPath, content, {
        flag: 'wx',
        mode: fileInfo.mode & 0o777,
      })
      await chmod(tempPath, fileInfo.mode & 0o777)
      await rename(tempPath, path)
    } catch (error) {
      await rm(tempPath, { force: true })
      throw error
    }

    const written = await readFile(path, 'utf8')
    if (written !== content) throw new Error(`manifest write verification failed for MCP server "${rawName}"`)
    const saved = JSON.parse(written)
    const savedEntry = saved?.mcpServers?.[rawName]
    const savedEnabled = savedEntry?.disabled !== true && savedEntry?.enabled !== false
    if (savedEnabled !== enabled) throw new Error(`manifest write verification failed for MCP server "${rawName}"`)
    return { backupPath, entry: savedEntry }
  } finally {
    await lock.close()
    await rm(lockPath, { force: true })
  }
}
