/**
 * dsh-kit-worktree client half。
 *
 * 注册两个 UI 注入点：
 *   1. conversation.hero.worktree —— 新建会话 hero 的 worktree 选择胶囊，
 *      与「项目文件夹 / 模式 preset」同一行（该槽由 DSH 前端运行时补丁新增，
 *      默认 main / 已有分支 / 新建分支并绑定）；
 *   2. conversation.session.header.actions —— 与「满血模式」标签并列的 worktree 徽标（同款样式）
 *      只读显示当前 worktree；新建会话走左侧栏原生入口。
 *
 * 数据全部来自 host 路由（/dsh-kit-worktree/...）；把 worktree 注册成 DSH
 * workspace、并让新会话落进去走官方 ctx.workspaces RPC，不直接改存储。
 */

import { WorktreeController, type WorktreeWorkspaces } from './controller.ts'
import { WorktreeSelector } from './selector.ts'
import { WorktreeBadge } from './badge.ts'

/** Cordis client plugin name（与 host 包同名）。 */
export const name = 'dsh-kit-worktree'

/** 依赖 client 根 context 上的 slots 与官方 workspaces service。 */
export const inject = ['slots', 'workspaces']

interface SlotRegistry {
  inject(name: string, fn: () => unknown): unknown
  register(...args: unknown[]): unknown
}

export function apply(ctx: { get(name: string): unknown }): void {
  const slots = ctx.get('slots') as SlotRegistry | undefined
  if (slots === undefined) return

  const workspaces = ctx.get('workspaces') as WorktreeWorkspaces | undefined
  if (workspaces === undefined) return
  const controller = new WorktreeController(workspaces)

  // 新建会话页：与「项目文件夹/模式」同一行的 worktree 选择胶囊。
  // 槽 conversation.hero.worktree 由 DSH 运行时补丁新增，single 且由此插件独占。
  slots.inject('conversation.hero.worktree', () =>
    slots.register({
      name: 'conversation.hero.worktree',
      id: 'dsh-kit-worktree-selector',
      inject: () => ({ controller }),
    }, WorktreeSelector),
  )


  // 会话标题旁：与「满血模式」标签并列（header.actions），样式对齐 AgentPresetLabel。
  slots.inject('conversation.session.header.actions', () =>
    slots.register({
      name: 'conversation.session.header.actions',
      id: 'dsh-kit-worktree-badge',
      priority: 0,
      inject: () => ({ controller }),
    }, WorktreeBadge),
  )
}
