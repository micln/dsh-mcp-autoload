import { randomUUID } from 'node:crypto'
import { chmod, copyFile, open, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const MAX_CONFIG_BYTES = 1_048_576
const LOCK_TIMEOUT_MS = 10_000
const LOCK_GRACE_MS = 5_000
const KEEP_BACKUPS = 5
const BACKUP_MARKER = '.bak-'
const BACKUP_NAME = /\.bak-\d{13}-[0-9a-f]{8}$/

/** Update one project MCP entry under a lock, keeping a backup and atomic rename. */
export async function setManifestServerEnabled(path, rawName, enabled) {
  if (typeof rawName !== 'string' || rawName.length === 0 || typeof enabled !== 'boolean') {
    throw new Error('invalid MCP toggle request')
  }

  const target = await resolveManifestPath(path)
  const lockPath = `${target}.lock`
  const lock = await acquireLock(lockPath)
  try {
    const fileInfo = await stat(target)
    if (fileInfo.size > MAX_CONFIG_BYTES) throw new Error(`manifest exceeds ${MAX_CONFIG_BYTES} bytes: ${target}`)

    const original = await readFile(target, 'utf8')
    if (Buffer.byteLength(original, 'utf8') > MAX_CONFIG_BYTES) throw new Error(`manifest exceeds ${MAX_CONFIG_BYTES} bytes: ${target}`)
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
    if (Buffer.byteLength(content, 'utf8') > MAX_CONFIG_BYTES) throw new Error(`updated manifest exceeds ${MAX_CONFIG_BYTES} bytes: ${target}`)
    const mode = fileInfo.mode & 0o777
    const backupPath = `${target}${BACKUP_MARKER}${Date.now()}-${randomUUID().slice(0, 8)}`
    await copyFile(target, backupPath)
    await chmod(backupPath, mode)
    const backup = await readFile(backupPath, 'utf8')
    if (backup !== original) throw new Error(`manifest backup verification failed: ${backupPath}`)
    await writeAtomically(target, content, mode)

    const written = await readFile(target, 'utf8')
    if (written !== content) throw new Error(`manifest write verification failed for MCP server "${rawName}"`)
    const saved = JSON.parse(written)
    const savedEntry = saved?.mcpServers?.[rawName]
    const savedEnabled = savedEntry?.disabled !== true && savedEntry?.enabled !== false
    if (savedEnabled !== enabled) throw new Error(`manifest write verification failed for MCP server "${rawName}"`)
    await pruneBackups(target, backupPath)
    return { backupPath, entry: savedEntry }
  } finally {
    await lock.handle.close().catch(() => {})
    await releaseLock(lockPath, lock.token)
  }
}

/**
 * Resolve the manifest to the regular file it ultimately names. A symlinked
 * manifest is followed rather than rejected, and every read, the lock and the
 * atomic rename all target the real file — so the user's symlink survives.
 */
async function resolveManifestPath(path) {
  let target
  try {
    target = await realpath(path)
  } catch (error) {
    throw new Error(`MCP manifest is unavailable: ${path} (${error?.code ?? error})`)
  }
  const info = await stat(target)
  if (!info.isFile()) throw new Error(`MCP manifest must be a regular file: ${path}`)
  return target
}

/** Write through a sibling temp file so a reader never sees a half-written manifest. */
async function writeAtomically(target, content, mode) {
  const tempPath = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(tempPath, content, { flag: 'wx', mode })
    await chmod(tempPath, mode)
    await rename(tempPath, target)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

/**
 * Take the manifest lock, reclaiming one whose owner is gone. Waiting is always
 * bounded by LOCK_TIMEOUT_MS so a session can never hang on a stale lock forever.
 */
async function acquireLock(lockPath) {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for manifest lock: ${lockPath} (delete it if no other session is writing)`)
    }
    try {
      const handle = await open(lockPath, 'wx', 0o600)
      const token = randomUUID()
      try {
        await handle.writeFile(`${process.pid} ${token}\n`)
        return { handle, token }
      } catch (error) {
        await handle.close().catch(() => {})
        await rm(lockPath, { force: true })
        throw error
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
    if (await reclaimStaleLock(lockPath)) continue
    await delay(40)
  }
}

/**
 * Drop a lock whose owner is gone. A recorded pid that is still alive is always
 * left alone, so a slow writer is never evicted mid-write. Renaming before
 * deleting keeps the takeover race-free: among concurrent waiters exactly one
 * rename can win. A lock file that was created but never written (no parseable
 * pid) only becomes reclaimable after LOCK_GRACE_MS.
 */
async function reclaimStaleLock(lockPath) {
  let info
  try {
    info = await stat(lockPath)
  } catch {
    return false
  }
  const pid = Number.parseInt(await readFile(lockPath, 'utf8').catch(() => ''), 10)
  if (Number.isInteger(pid) && pid > 0) {
    if (isProcessAlive(pid)) return false
  } else if (Date.now() - info.mtimeMs < LOCK_GRACE_MS) {
    return false
  }
  const stalePath = `${lockPath}.stale-${randomUUID()}`
  try {
    await rename(lockPath, stalePath)
  } catch {
    return false
  }
  await rm(stalePath, { force: true }).catch(() => {})
  return true
}

/** Release the lock only while it is still the one this caller created. */
async function releaseLock(lockPath, token) {
  const current = await readFile(lockPath, 'utf8').catch(() => '')
  if (!current.includes(token)) return
  await rm(lockPath, { force: true })
}

/** Signal 0 only probes for existence; EPERM still means the owner is alive. */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

/**
 * Keep the newest backups and drop older ones, counting the backup this call
 * just reported against the budget. Only names this module produced are
 * considered, and `keepPath` is never a candidate — never a hand-made file the
 * user happens to have named the same way, and never the reported backup.
 */
async function pruneBackups(target, keepPath) {
  const directory = dirname(target)
  const prefix = `${basename(target)}${BACKUP_MARKER}`
  const names = await readdir(directory).catch(() => [])
  const stale = names
    .filter(name => name.startsWith(prefix) && BACKUP_NAME.test(name))
    .filter(name => join(directory, name) !== keepPath)
    .sort()
    .reverse()
    .slice(KEEP_BACKUPS - 1)
  await Promise.all(stale.map(name => rm(join(directory, name), { force: true }).catch(() => {})))
}
