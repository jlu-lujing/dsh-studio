/**
 * ArchiveManager — 已归档会话（archived sessions）管理。
 *
 * DSH 官方把"归档"实现为把 sessionId 加进 workspace 注册表的
 * `global.archivedSessionIds` 集合（见 docs：归档只隐藏不删日志），但**没有**
 * 提供"恢复(unarchive)"和"删除(delete)"的 API。本模块补齐这两块：
 *
 *   - 恢复：把 sessionId 从 archivedSessionIds 移除（官方保留了 workspace
 *     `sessionIds` 槽位，恢复后回到原分组位置）；
 *   - 删除：同时从 archivedSessionIds 和所有 workspace 的 sessionIds 移除，
 *     并删除磁盘上 `~/.dsh/sessions/<cwd>/session-<id>/` 整个目录（真删除，
 *     不可恢复，UI 需二次确认）。
 *
 * 落盘文件：`~/.dsh/storages/workspace.json`（dsh 的 workspace 注册表，
 * `global` + `tables` 结构，见 @deepseek-ai/dsh-storage-json 序列化格式）。
 * 注意：dsh 运行期内该文件的内存态是权威，重启 dsh 后本模块的改动才会被
 * 注册表重新读取——因此设置页操作后提示"重启后生效"。
 */

import { readFileSync, renameSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** workspace.json 的磁盘结构（只取本模块关心的字段）。 */
interface WorkspaceFile {
  global: {
    initialized?: boolean
    workspaceIds?: string[]
    archivedSessionIds: string[]
  }
  tables?: Record<string, Record<string, { path?: string; title?: string; sessionIds?: string[] }>>
}

/** 单个归档会话的展示条目。 */
export interface ArchivedSessionView {
  sessionId: string
  /** 所属工作区标题（找不到时为空）。 */
  workspaceTitle?: string
  /** 所属工作区路径（找不到时为空）。 */
  workspacePath?: string
  /** 会话文件是否存在（删除后此字段用于区分）。 */
  onDisk: boolean
  /** session.jsonl.zstd 的最后修改时间（毫秒），无则 0。 */
  mtimeMs: number
}

function workspaceFile(home: string): string {
  return join(home, 'storages', 'workspace.json')
}

function load(home: string): WorkspaceFile {
  try {
    return JSON.parse(readFileSync(workspaceFile(home), 'utf8')) as WorkspaceFile
  } catch {
    return { global: { archivedSessionIds: [] } }
  }
}

function save(home: string, state: WorkspaceFile): void {
  const target = workspaceFile(home)
  mkdirSync(dirname(target), { recursive: true })
  // Atomic write (tmp + rename): this file is dsh's own workspace registry —
  // a torn write would corrupt official dsh data, so never write in place.
  const tmp = `${target}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
  renameSync(tmp, target)
}

/** 定位一个归档会话在 ~/.dsh/sessions 下的真实目录。 */
function findSessionDir(home: string, sessionId: string): string | null {
  const base = join(home, 'sessions')
  // sessions 下每个子目录名是 cwd 的转义；session-<id> 目录在其中。
  try {
    for (const cwdDir of readDir(base)) {
      const candidate = join(base, cwdDir, sessionId)
      if (existsDir(candidate)) return candidate
    }
  } catch {
    /* 忽略 */
  }
  return null
}

function readDir(path: string): string[] {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

function existsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** 列出所有已归档会话（含工作区归属与磁盘状态），按归档顺序。 */
export function listArchived(home: string): { items: ArchivedSessionView[]; count: number } {
  const state = load(home)
  const ids = state.global.archivedSessionIds ?? []
  const tables = state.tables ?? {}
  const items: ArchivedSessionView[] = ids.map((sessionId) => {
    // 找一个包含该 sessionId 的 workspace
    let workspaceTitle: string | undefined
    let workspacePath: string | undefined
    for (const group of Object.values(tables)) {
      for (const [, record] of Object.entries(group)) {
        const list = record.sessionIds ?? []
        if (list.includes(sessionId)) {
          workspaceTitle = record.title ?? undefined
          workspacePath = record.path
          break
        }
      }
      if (workspaceTitle) break
    }
    const dir = findSessionDir(home, sessionId)
    let mtimeMs = 0
    try {
      if (dir) mtimeMs = statSync(dir).mtimeMs
    } catch { /* 忽略 */ }
    return {
      sessionId,
      workspaceTitle,
      workspacePath,
      onDisk: dir !== null,
      mtimeMs,
    }
  })
  return { items, count: items.length }
}

/** 恢复一个归档会话：从 archivedSessionIds 移除（workspace 槽位保留）。 */
export function restoreSession(home: string, sessionId: string): { ok: true; restored: string[] } {
  const state = load(home)
  const ids = state.global.archivedSessionIds ?? []
  if (!ids.includes(sessionId)) {
    // 幂等：不在集合里也视为已恢复
    return { ok: true, restored: ids }
  }
  state.global.archivedSessionIds = ids.filter((id) => id !== sessionId)
  save(home, state)
  return { ok: true, restored: state.global.archivedSessionIds }
}

/** 删除一个会话：从归档集移除 + 从所有 workspace 的 sessionIds 移除 + 删磁盘目录。 */
export function deleteSession(home: string, sessionId: string): { ok: boolean; error?: string; removedFromWorkspace?: boolean } {
  const state = load(home)
  const ids = state.global.archivedSessionIds ?? []
  // 即使不在归档集也允许删除（清理孤儿会话），但仅当会话确实存在时。
  state.global.archivedSessionIds = ids.filter((id) => id !== sessionId)

  const removedFromWorkspace = dropFromWorkspaces(state, sessionId)
  save(home, state)

  // 删除磁盘上的 session 目录
  const dir = findSessionDir(home, sessionId)
  if (dir) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch (error) {
      return { ok: false, error: `session dir remove failed: ${String(error)}`, removedFromWorkspace }
    }
  }
  return { ok: true, removedFromWorkspace }
}

/** 从所有 workspace 的 sessionIds 中摘除一个 id（就地修改 state）。 */
function dropFromWorkspaces(state: WorkspaceFile, sessionId: string): boolean {
  const tables = state.tables
  if (!tables) return false
  let changed = false
  for (const group of Object.values(tables)) {
    for (const record of Object.values(group)) {
      if (record.sessionIds?.includes(sessionId)) {
        record.sessionIds = record.sessionIds.filter((id) => id !== sessionId)
        changed = true
      }
    }
  }
  return changed
}

/**
 * 删除全部归档会话：清空 archivedSessionIds、从所有 workspace 的 sessionIds
 * 摘除每个归档 id，并删除磁盘上对应的 session 目录。
 * @returns 删除的条目（含成功/失败明细）与计数。
 */
export function deleteAllArchived(home: string): {
  ok: boolean
  deleted: number
  failed: { sessionId: string; error: string }[]
  archivedCleared: number
} {
  const state = load(home)
  const ids = [...(state.global.archivedSessionIds ?? [])]

  // 逐个在 workspace 摘除（不重新保存，最后一次一并写盘）
  const failed: { sessionId: string; error: string }[] = []
  let deleted = 0
  for (const sessionId of ids) {
    dropFromWorkspaces(state, sessionId)
    const dir = findSessionDir(home, sessionId)
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch (error) {
        failed.push({ sessionId, error: `dir remove failed: ${String(error)}` })
        continue
      }
    }
    deleted += 1
  }

  state.global.archivedSessionIds = []
  save(home, state)
  return { ok: failed.length === 0, deleted, failed, archivedCleared: ids.length }
}
