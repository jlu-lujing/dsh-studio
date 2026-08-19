import test from 'node:test'
import assert from 'node:assert/strict'
import { WorktreeController } from '../src/worktree/client/controller.ts'

function fakeFetch(routes) {
  return async (url, opts) => {
    const key = `${opts?.method ?? 'GET'} ${String(url).split('?')[0]}`
    const route = routes[key]
    if (route === undefined) {
      return { ok: false, status: 404, json: async () => ({ error: 'not found' }) }
    }
    if (typeof route === 'function') return route(url, opts)
    if (route.ok === false) return route
    return { ok: true, status: 200, json: async () => route }
  }
}

function makeWorkspaces(calls) {
  return {
    async create(input) {
      calls.push(`create:${input.path}`)
      return { workspaceId: 'ws-1', path: input.path, title: 't', sessionIds: [], createdAt: '', updatedAt: '' }
    },
    startSession(workspaceId) {
      calls.push(`start:${workspaceId ?? ''}`)
    },
  }
}

test('controller：list/attribution 走 host 路由并带 cwd', async () => {
  const seen = []
  const fetchImpl = fakeFetch({
    'GET /dsh-studio-worktree/worktrees': (url) => {
      seen.push(String(url))
      return {
        ok: true,
        status: 200,
        json: async () => ({ root: '/repo', defaultParent: '/repo/.dsh/worktree', worktrees: [
          { path: '/repo', branch: 'refs/heads/main', main: true },
          { path: '/repo/.dsh/worktree/feat/x', branch: 'refs/heads/feat/x', main: false },
        ] }),
      }
    },
    'GET /dsh-studio-worktree/attribution': () => ({
      ok: true,
      status: 200,
      json: async () => ({ attribution: { mode: 'worktree', root: '/repo', branch: 'feat/x' } }),
    }),
  })
  const controller = new WorktreeController(makeWorkspaces([]), fetchImpl)

  const list = await controller.list('/repo with space')
  assert.equal(list.worktrees.length, 2)
  assert.ok(seen[0].includes(encodeURIComponent('/repo with space')))

  const attr = await controller.attribution('/repo/.dsh/worktree/feat/x')
  assert.equal(attr.mode, 'worktree')
  assert.equal(attr.branch, 'feat/x')
})

test('controller：bindExisting = workspaces.create + startSession', async () => {
  const calls = []
  const controller = new WorktreeController(makeWorkspaces(calls), fakeFetch({}))
  const ws = await controller.bindExisting('/repo/.dsh/worktree/feat/x')
  assert.equal(ws.workspaceId, 'ws-1')
  assert.deepEqual(calls, ['create:/repo/.dsh/worktree/feat/x', 'start:ws-1'])
})

test('controller：createAndBind 先 POST 建 git worktree，再注册+开会话', async () => {
  const calls = []
  let posted = null
  const fetchImpl = fakeFetch({
    'POST /dsh-studio-worktree/worktrees': (url, opts) => {
      posted = JSON.parse(opts.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, path: '/repo/.dsh/worktree/feat/new', branch: 'feat/new', added: true }),
      }
    },
  })
  const controller = new WorktreeController(makeWorkspaces(calls), fetchImpl)
  await controller.createAndBind({ cwd: '/repo', branch: 'feat/new' })

  assert.deepEqual(posted, { cwd: '/repo', branch: 'feat/new' })
  assert.deepEqual(calls, ['create:/repo/.dsh/worktree/feat/new', 'start:ws-1'])
})

test('controller：host 错误透传为 Error', async () => {
  const fetchImpl = fakeFetch({
    'GET /dsh-studio-worktree/attribution': { ok: false, status: 500, json: async () => ({ error: 'git failed', detail: 'fatal: x' }) },
  })
  const controller = new WorktreeController(makeWorkspaces([]), fetchImpl)
  await assert.rejects(() => controller.attribution('/repo'), /git failed.*fatal: x/)
})
