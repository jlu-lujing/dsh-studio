/**
 * dsh-studio-worktree — git worktree 管理的核心纯函数层。
 *
 * 全部通过 `git` CLI（execFile，不经 shell）操作，无任何第三方运行时依赖：
 *   git rev-parse --show-toplevel      探测仓库根
 *   git worktree list --porcelain      列出 worktrees
 *   git worktree add <path> -b <branch> [base]   新建
 *   git worktree remove <path> [--force]         删除
 *   git worktree prune                          清理失效登记
 *   git check-ref-format --branch <name>         分支名校验
 *
 * 落盘位置策略：
 *   - 默认建在仓库内部被 git 忽略的 `.dsh/worktree/<name>`（已验证可行，且
 *     不会进入版本控制）。空 .dsh/ 目录在 git 里不存在，主 worktree 侧不受影响。
 *   - 可选 externalPath 覆盖（绝对路径，仓库外）。
 *   - 归一化用 fs.realpathSync（与 @deepseek-ai/dsh-workspace 的 canonical
 *     口径一致），新建路径其父目录必须已存在。
 */

import { realpathSync, statSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export interface WorktreeEntry {
  path: string
  /** Checked-out branch ref (`refs/heads/<name>`), absent when detached. */
  branch?: string
  /** Detached HEAD commit full sha when present. */
  hint?: string
  /** Porcelain `PID ...` head line when present. */
  head?: string
  /** `locked` marker from porcelain (bare 'locked' or 'locked reason'). */
  locked?: string
  /** `prunable` marker from porcelain. */
  prunable?: string
  bare?: boolean
  /** Main worktree of the repo. */
  main: boolean
}

export interface WorktreeListResult {
  /** Repo root (canonical absolute path). */
  root: string
  /** Default worktree parent under the repo root. */
  defaultParent: string
  worktrees: WorktreeEntry[]
}

export interface CreateOptions {
  /** Branch to check out. New branch created if not existing. */
  branch: string
  /** Optional custom path (defaults to <repoRoot>/.dsh/worktree/<branch>). */
  path?: string
  /** Optional base: commit-ish / existing branch / start point. */
  base?: string
  /** Git working directory (defaults to process.cwd()). */
  cwd?: string
}

export interface RemoveOptions {
  path: string
  force?: boolean
}

export interface NormalizedCreate {
  /** Real absolute path where the worktree will be created. */
  path: string
  branch: string
}

export class GitWorktreeError extends Error {
  readonly cmd: string
  readonly code: number | null
  readonly stderr: string
  constructor(msg: string, cmd: string, code: number | null, stderr: string) {
    super(msg)
    this.name = 'GitWorktreeError'
    this.cmd = cmd
    this.code = code
    this.stderr = stderr
  }
}

/** Resolve `git` binary; throws with a friendlier message when absent. */
export function resolveGitBin(): string {
  return 'git'
}

import { spawnSync } from 'node:child_process'

function gitOut(args: string[], cwd?: string): string {
  let resolved: string
  try {
    resolved = cwd ? resolve(cwd) : process.cwd()
  } catch {
    resolved = process.cwd()
  }
  const res = spawnSync(resolveGitBin(), args, {
    cwd: resolved,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (res.error !== undefined) {
    throw new GitWorktreeError(`cannot run git: ${res.error.message}`, args.join(' '), null, '')
  }
  if (res.status !== 0) {
    throw new GitWorktreeError(
      `git ${args[0] ?? ''} failed (exit ${res.status})`,
      args.join(' '),
      res.status,
      (res.stderr ?? '').trim(),
    )
  }
  return (res.stdout ?? '').trim()
}

/** js normalized absolute path (realpath). Throws if missing. */
function canonical(p: string): string {
  return realpathSync(p)
}

/** 主仓库根（main worktree 路径）：取 common git dir 的父目录。
 * 从 linked worktree 调用时，--show-toplevel 会返回该 worktree 自身，因此
 * 归属判定必须用 common dir 定位真正的主路径。 */
export function repoRoot(cwd?: string): string {
  const gitDir = gitOut(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd)
  return canonical(dirname(gitDir))
}

/** Whether we are inside a git worktree (not the main worktree). */
export function isWorktree(cwd?: string): boolean {
  try {
    const out = gitOut(['rev-parse', '--is-inside-work-tree'], cwd)
    return out === 'true'
  } catch {
    return false
  }
}

/** Default parent dir for internally-managed worktrees under a repo root. */
export function defaultParent(root: string): string {
  return join(root, '.dsh', 'worktree')
}

/** Validate and normalize a proposed new branch name. */
export function validateBranch(branch: string): boolean {
  if (!branch || branch.trim() === '') return false
  try {
    gitOut(['check-ref-format', '--branch', branch.trim()])
    return true
  } catch {
    return false
  }
}

/** Whether a branch is currently checked out by some worktree. */
export function branchInUse(cwd: string | undefined, branch: string): boolean {
  const list = listWorktrees(cwd)
  return list.worktrees.some((w) => w.branch === `refs/heads/${branch}`)
}

/** Parse `git worktree list --porcelain` lines into entries. */
export function parsePorcelain(raw: string, root: string): { main: WorktreeEntry; others: WorktreeEntry[] } {
  const entries: WorktreeEntry[] = []
  let cur: Partial<WorktreeEntry> | null = null
  for (const line of raw.split('\n')) {
    if (line === '') {
      if (cur !== null) {
        entries.push(cur as WorktreeEntry)
        cur = null
      }
      continue
    }
    if (line === 'worktree ' || line.startsWith('worktree ') === false) {
      // empty
    }
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('worktree ')) {
      cur = { path: trimmed.slice('worktree '.length) }
      continue
    }
    if (cur === undefined || cur === null) continue
    const sp = trimmed.indexOf(' ')
    const key = sp === -1 ? trimmed : trimmed.slice(0, sp)
    const value = sp === -1 ? '' : trimmed.slice(sp + 1)
    if (key === 'HEAD') cur.head = value
    else if (key === 'branch') cur.branch = value
    else if (key === 'detached') cur.hint = value
    else if (key === 'bare') cur.bare = true
    else if (key === 'locked') cur.locked = value || 'locked'
    else if (key === 'prunable') cur.prunable = value || 'prunable'
  }
  if (cur !== null) entries.push(cur as WorktreeEntry)

  const mainPath = canonical(root)
  const main = entries.find((e) => {
    try { return canonical(e.path) === mainPath } catch { return false }
  })
  const rest = entries.filter((e) => {
    try { return canonical(e.path) !== mainPath } catch { return true }
  })
  const mapped = (e: WorktreeEntry): WorktreeEntry => ({
    ...e,
    path: e.path,
    main: e === main,
  })
  if (main !== undefined) {
    Object.assign(main, { main: true })
  }
  const othersMapped = rest.map((e) => ({ ...e, main: false }))
  return {
    main: main as WorktreeEntry,
    others: othersMapped,
  }
}

/** List worktrees of the repo containing `cwd`. */
export function listWorktrees(cwd?: string): WorktreeListResult {
  const root = repoRoot(cwd)
  const raw = gitOut(['worktree', 'list', '--porcelain'], cwd)
  const parsed = parsePorcelain(raw, root)
  const worktrees = [parsed.main, ...parsed.others].filter(Boolean)
  return {
    root,
    defaultParent: defaultParent(root),
    worktrees,
  }
}

/** Whether two paths refer to the same canonical location. */
function samePath(a: string, b: string): boolean {
  try { return canonical(a) === canonical(b) } catch { return resolve(a) === resolve(b) }
}

/** target path dir exists? */
function dirExists(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

/**
 * Resolve the (non-existing) target path for a create request. Returns the
 * absolute normalized path; throws if the parent directory does not exist.
 */
export function normalizeCreatePath(root: string, branch: string, path?: string): string {
  if (path !== undefined && path.trim() !== '') {
    const abs = resolve(path)
    const parent = dirname(abs)
    if (!dirExists(parent)) {
      throw new GitWorktreeError(
        `parent directory does not exist: ${parent}`,
        'worktree add', null, '',
      )
    }
    return abs
  }
  const base = defaultParent(root)
  mkdirSync(base, { recursive: true })
  return join(base, branch)
}

/**
 * Create a git worktree.
 * - New branch when the branch is not checked out anywhere else.
 * - If the branch already exists (and not in use), add using it.
 * - If it is in use by another worktree, throws a clear error.
 */
export function createWorktree(opts: CreateOptions): { path: string; branch: string; added: boolean } {
  const cwd = opts.cwd
  const root = cwd ? repoRoot(cwd) : repoRoot()
  const branch = opts.branch.trim()
  if (!validateBranch(branch)) {
    throw new GitWorktreeError(`invalid branch name: ${branch}`, 'worktree add', null, '')
  }
  const target = normalizeCreatePath(root, branch, opts.path)
  if (dirExists(target)) {
    throw new GitWorktreeError(`target path already exists: ${target}`, 'worktree add', null, '')
  }
  if (branchInUse(cwd, branch)) {
    throw new GitWorktreeError(
      `branch '${branch}' is already checked out by another worktree`,
      'worktree add', null, '',
    )
  }
  const args = ['worktree', 'add', target, '-b', branch]
  if (opts.base !== undefined && opts.base.trim() !== '') args.push(opts.base.trim())
  gitOut(args, cwd)
  return { path: canonical(target), branch, added: true }
}

/** Remove a git worktree (refuse main / nonexistent). */
export function removeWorktree(opts: RemoveOptions, cwd?: string): { path: string; removed: boolean } {
  const root = cwd ? repoRoot(cwd) : repoRoot()
  const abs = resolve(opts.path)
  const list = listWorktrees(cwd)
  const target = list.worktrees.find((w) => samePath(w.path, abs))
  if (target === undefined || target.main) {
    throw new GitWorktreeError(`not a removable worktree: ${abs}`, 'worktree remove', null, '')
  }
  const args = ['worktree', 'remove', abs]
  if (opts.force) args.push('--force')
  gitOut(args, cwd)
  return { path: abs, removed: true }
}

/** Prune stale worktree administrative files. */
export function pruneWorktrees(cwd?: string): { pruned: boolean } {
  gitOut(['worktree', 'prune'], cwd)
  return { pruned: true }
}

/** Get repo root basename (suggested title). */
export function repoName(cwd?: string): string {
  return basename(cwd ? repoRoot(cwd) : repoRoot())
}

/** Whether a directory is a git repo root / worktree (has .git or is inside one). */
export function isRepoDir(cwd?: string): boolean {
  try {
    return gitOut(['rev-parse', '--is-inside-work-tree'], cwd) === 'true'
  } catch {
    return false
  }
}

export interface CheckResult {
  ok: boolean
  error?: string
  repoRoot?: string
}

/** Probe the current directory as a git repo (used by the settings panel). */
export function checkRepo(cwd?: string): CheckResult {
  try {
    const root = repoRoot(cwd)
    return { ok: true, repoRoot: root }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/* ── 会话 → worktree 归属判定 ───────────────────────────────────── */

/** 会话归属：main = 项目主路径；worktree = 某个 `.dsh/worktree` 分支。 */
export interface WorktreeAttribution {
  mode: 'main' | 'worktree'
  /** git 仓库根（= 主 worktree 路径）。cwd 不属于任何仓库时回退为 cwd 本身。 */
  root: string
  /** 命中 linked worktree 时的绝对路径。 */
  path?: string
  /** 短分支名（不含 `refs/heads/`）。 */
  branch?: string
  /** 未能解析进任何 git 仓库（调用方通常按 main 展示）。 */
  unresolved?: boolean
}

/** 规范化比较键：优先 realpath；不存在时退回绝对路径（win32 忽略大小写）。 */
function pathKey(p: string): string {
  let value = p
  try {
    value = realpathSync(p)
  } catch {
    value = resolve(p)
  }
  if (process.platform === 'win32') value = value.toLowerCase()
  return value.split('\\').join('/')
}

/** child 是否等于 parent 或位于其目录树内（统一小写/斜杠规范后做前缀比较）。 */
function isSameOrInside(child: string, parent: string): boolean {
  const a = pathKey(child)
  const b = pathKey(parent)
  if (a === b) return true
  return a.startsWith(b.endsWith('/') ? b : `${b}/`)
}

/** `refs/heads/feat/x` → `feat/x`。 */
export function shortBranch(branch?: string): string | undefined {
  const prefix = 'refs/heads/'
  return branch !== undefined && branch.startsWith(prefix)
    ? branch.slice(prefix.length)
    : branch
}

/**
 * 计算一个会话目录的 worktree 归属。
 *
 * 规则（按优先级）：
 *  1. cwd 等于或位于某个 linked worktree 目录内 → `worktree`（路径最长的先匹配，
 *     嵌套路径更精确）；
 *  2. cwd 等于或位于主 worktree 内 → `main`；
 *  3. cwd 不在任何 git 仓库 → 兜底 `main`（unresolved: true，UI 仍显示 main）。
 */
export function resolveAttribution(cwd?: string): WorktreeAttribution {
  const target = cwd === undefined || cwd.trim() === '' ? process.cwd() : resolve(cwd)
  let list: WorktreeListResult
  try {
    list = listWorktrees(target)
  } catch {
    return { mode: 'main', root: target, unresolved: true }
  }

  const main = list.worktrees.find((w) => w.main)
  const linked = list.worktrees
    .filter((w) => !w.main)
    .sort((a, b) => b.path.length - a.path.length)

  for (const wt of linked) {
    if (isSameOrInside(target, wt.path)) {
      return {
        mode: 'worktree',
        root: list.root,
        path: wt.path,
        branch: shortBranch(wt.branch),
      }
    }
  }

  return {
    mode: 'main',
    root: list.root,
    branch: shortBranch(main?.branch),
  }
}

