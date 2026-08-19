/**
 * dsh-studio-worktree client controller — host 路由 + 官方 workspaces service
 * 之间的纯逻辑胶水（无 React，可单测）。
 *
 * 两条动作线：
 *   1. 读：列出某仓库的 git worktrees、解析会话 cwd 归属；
 *   2. 写：新建 worktree（host 跑 git）→ 注册为 DSH workspace（官方 RPC）
 *      → startSession 把新会话落到该目录。
 */

export interface WorktreeEntry {
  path: string
  branch?: string
  hint?: string
  head?: string
  locked?: string
  prunable?: string
  bare?: boolean
  main: boolean
}

export interface WorktreeList {
  root: string
  defaultParent: string
  worktrees: WorktreeEntry[]
}

export interface Attribution {
  mode: 'main' | 'worktree'
  root: string
  path?: string
  branch?: string
  unresolved?: boolean
}

export interface WorkspaceView {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  createdAt: string
  updatedAt: string
}

/** dsh-client-runtime 的 `ctx.workspaces` 面向 feature 包的公开面（用到的子集）。 */
export interface WorktreeWorkspaces {
  create(input: { path: string }): Promise<WorkspaceView>
  startSession(workspaceId?: string): void
}

const PREFIX = '/dsh-studio-worktree'

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({})) as T & { error?: string; detail?: string }
  if (!res.ok) {
    const base = data.error || `HTTP ${res.status}`
    throw new Error(data.detail ? `${base}: ${data.detail}` : base)
  }
  return data
}

export class WorktreeController {
  readonly workspaces: WorktreeWorkspaces
  private readonly fetchImpl: typeof fetch

  constructor(workspaces: WorktreeWorkspaces, fetchImpl: typeof fetch = fetch) {
    this.workspaces = workspaces
    // bind 到 globalThis：浏览器里原生 fetch 依赖正确的 `this`，否则报 Illegal invocation
    this.fetchImpl = fetchImpl.bind(globalThis)
  }

  /** 列出 `cwd` 所属仓库的全部 git worktrees。 */
  async list(cwd: string): Promise<WorktreeList> {
    const url = `${PREFIX}/worktrees?cwd=${encodeURIComponent(cwd)}`
    const data = await parseJson<{ root: string; defaultParent: string; worktrees: WorktreeEntry[] }>(
      await this.fetchImpl(url),
    )
    return { root: data.root, defaultParent: data.defaultParent, worktrees: data.worktrees }
  }

  /** 解析会话目录归属（main / 分支 worktree）。 */
  async attribution(cwd: string): Promise<Attribution> {
    const url = `${PREFIX}/attribution?cwd=${encodeURIComponent(cwd)}`
    const data = await parseJson<{ attribution: Attribution }>(await this.fetchImpl(url))
    return data.attribution
  }

  /**
   * 把已存在的 worktree 目录注册成 DSH workspace（幂等），并把新会话
   * 连接到该 workspace。目录必须已存在 —— 官方 workspaces.create 不 mkdir。
   */
  async bindExisting(path: string): Promise<WorkspaceView> {
    const workspace = await this.workspaces.create({ path })
    this.workspaces.startSession(workspace.workspaceId)
    return workspace
  }

  /** host 侧新建 git worktree（默认落 .dsh/worktree/<branch>），再注册 + 开会话。 */
  async createAndBind(input: { cwd: string; branch: string; base?: string }): Promise<WorkspaceView> {
    const res = await this.fetchImpl(`${PREFIX}/worktrees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd: input.cwd, branch: input.branch, ...(input.base ? { base: input.base } : {}) }),
    })
    const data = await parseJson<{ path: string }>(res)
    return this.bindExisting(data.path)
  }
}
