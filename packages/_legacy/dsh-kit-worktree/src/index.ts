/**
 * dsh-kit-worktree host plugin.
 *
 * host 侧插件：不声明 dsh.bundle，行由 dsh-kit 聚合包挂载（与 scheduler /
 * notifier 一致）。提供一组 loopback 管理路由，把 `git worktree` 封装成
 * 「列表 / 新建 / 删除 / 清理 / 会话归属判定」：
 *
 *   GET  /dsh-kit-worktree/worktrees?cwd=<path>   → { root, defaultParent, worktrees }
 *   POST /dsh-kit-worktree/worktrees              body { branch, path?, base?, cwd? } → 新建
 *   POST /dsh-kit-worktree/worktrees/remove       body { path, force?, cwd? }         → 删除
 *   POST /dsh-kit-worktree/worktrees/prune?cwd=   → 清理失效登记
 *   GET  /dsh-kit-worktree/status?cwd=<path>      → 目录是否 git 仓库
 *   GET  /dsh-kit-worktree/attribution?cwd=<path> → 会话目录归属 main/worktree
 *
 * `cwd` 缺省时退回 dsh 进程工作目录（兼容最早的 host-only 用法）。
 *
 * 路由挂在 loopback DSH webServer（生命周期同 scheduler）：局域网通过
 * lan-auth 网关进来的流量在 DSH 眼里仍是 loopback 调用，因此与其它 dsh-kit
 * 管理路由同信任面（网关即鉴权边界，本路由不再单独鉴权）。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  listWorktrees,
  createWorktree,
  removeWorktree,
  pruneWorktrees,
  checkRepo,
  repoName,
  resolveAttribution,
  GitWorktreeError,
  type CreateOptions,
} from './worktree.ts'

/** Cordis plugin name. */
export const name = 'dsh-kit-worktree'

/** Required services: the webserver hosts the management routes. */
export const inject = ['webServer']

export interface Config {
  /** Optional fixed base directory. Not dynamic currently. */
  baseDir?: string
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })

/** Map a thrown error (GitWorktreeError or generic) to a JSON response. */
function toErrorBody(error: unknown): { status: number; error: string; detail?: string } {
  if (error instanceof GitWorktreeError) {
    return { status: 400, error: error.message, detail: error.stderr || error.cmd }
  }
  return { status: 500, error: error instanceof Error ? error.message : String(error) }
}

export function apply(ctx: Context, config: Config = {}): void {
  void config
  const webServer = ctx.get('webServer') as {
    register(opts: {
      kind: 'exact' | 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): (() => void) | undefined
  } | undefined
  if (webServer === undefined) return

  const PREFIX = '/dsh-kit-worktree'

  const queryCwd = (req: IncomingMessage): string | undefined => {
    const raw = new URL(req.url ?? '/', 'http://localhost').searchParams.get('cwd')
    return raw !== null && raw.trim() !== '' ? raw.trim() : undefined
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const pathname = (req.url ?? '/').split('?')[0]
    const cwd = queryCwd(req)

    // GET /status — 目录是否为 git 仓库（面板探测用）。
    if (req.method === 'GET' && pathname === `${PREFIX}/status`) {
      const repo = checkRepo(cwd)
      return sendJson(res, 200, {
        ok: repo.ok,
        ...(repo.ok
          ? { repoRoot: repo.repoRoot, repoName: repo.repoRoot ? repoName(repo.repoRoot) : null }
          : { error: repo.error }),
      })
    }

    // GET /attribution — 会话目录归属（main / 某个分支 worktree）。
    if (req.method === 'GET' && pathname === `${PREFIX}/attribution`) {
      try {
        return sendJson(res, 200, { ok: true, attribution: resolveAttribution(cwd) })
      } catch (error) {
        const e = toErrorBody(error)
        return sendJson(res, e.status, { ok: false, error: e.error, detail: e.detail })
      }
    }

    // GET /worktrees — 列出仓库的 worktrees。
    if (req.method === 'GET' && (pathname === PREFIX || pathname === `${PREFIX}/worktrees` || pathname === `${PREFIX}/worktrees/`)) {
      try {
        const result = listWorktrees(cwd)
        return sendJson(res, 200, { ok: true, ...result })
      } catch (error) {
        const e = toErrorBody(error)
        return sendJson(res, e.status, { ok: false, error: e.error, detail: e.detail })
      }
    }

    // POST /worktrees — 新建。
    if (req.method === 'POST' && (pathname === `${PREFIX}/worktrees` || pathname === `${PREFIX}/worktrees/`)) {
      const [contentType] = (req.headers['content-type'] ?? '').split(';')
      if (contentType !== 'application/json') {
        return sendJson(res, 415, { error: 'content-type must be application/json' })
      }
      try {
        const body = JSON.parse(await readBody(req)) as {
          branch?: unknown; path?: unknown; base?: unknown; cwd?: unknown
        }
        if (typeof body.branch !== 'string' || body.branch.trim() === '') {
          return sendJson(res, 400, { error: 'branch is required' })
        }
        const opts: CreateOptions = { branch: body.branch }
        if (typeof body.path === 'string' && body.path.trim() !== '') opts.path = body.path.trim()
        if (typeof body.base === 'string' && body.base.trim() !== '') opts.base = body.base.trim()
        if (typeof body.cwd === 'string' && body.cwd.trim() !== '') opts.cwd = body.cwd.trim()
        const result = createWorktree(opts)
        return sendJson(res, 200, { ok: true, ...result })
      } catch (error) {
        const e = toErrorBody(error)
        return sendJson(res, e.status, { ok: false, error: e.error, detail: e.detail })
      }
    }

    // POST /worktrees/remove — 删除。
    if (req.method === 'POST' && pathname === `${PREFIX}/worktrees/remove`) {
      const [contentType] = (req.headers['content-type'] ?? '').split(';')
      if (contentType !== 'application/json') {
        return sendJson(res, 415, { error: 'content-type must be application/json' })
      }
      try {
        const body = JSON.parse(await readBody(req)) as { path?: unknown; force?: unknown; cwd?: unknown }
        if (typeof body.path !== 'string' || body.path.trim() === '') {
          return sendJson(res, 400, { error: 'path is required' })
        }
        const bodyCwd = typeof body.cwd === 'string' && body.cwd.trim() !== '' ? body.cwd.trim() : undefined
        const result = removeWorktree({ path: body.path, force: body.force === true }, bodyCwd ?? cwd)
        return sendJson(res, 200, { ok: true, ...result })
      } catch (error) {
        const e = toErrorBody(error)
        return sendJson(res, e.status, { ok: false, error: e.error, detail: e.detail })
      }
    }

    // POST /worktrees/prune — 清理失效登记。
    if (req.method === 'POST' && pathname === `${PREFIX}/worktrees/prune`) {
      try {
        const result = pruneWorktrees(cwd)
        return sendJson(res, 200, { ok: true, ...result })
      } catch (error) {
        const e = toErrorBody(error)
        return sendJson(res, e.status, { ok: false, error: e.error, detail: e.detail })
      }
    }

    sendJson(res, 404, { error: 'not found' })
  }

  const dispose = webServer.register({ kind: 'prefix', path: PREFIX, handler })
  ctx.effect(() => () => dispose?.(), 'dsh-kit-worktree.http-routes')
}
