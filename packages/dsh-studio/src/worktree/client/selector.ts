/**
 * 新建会话页的 worktree 选择 —— 与「项目文件夹 / 模式 preset」同款的小胶囊，且
 * 由 DSH 前端运行时补丁渲染进同一行（conversation.hero.worktree 槽，single）。
 *
 * root 全局槽：标准 props 提供 useSessions/useWorkspaces（无 useSession），
 * 当前会话取 `useSessions(s => s.current)`。
 */

import { createElement, useEffect, useState } from 'react'
import { GitBranchIcon } from './icon.ts'
import type { Attribution, WorktreeController, WorktreeEntry, WorktreeList } from './controller.ts'

const tk = {
  text: 'var(--dsw-alias-label-primary)',
  tertiary: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l2)',
  panel: 'var(--dsw-alias-bg-layer-3)',
  primary: 'var(--dsw-alias-state-business-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
}

/* 对齐「项目文件夹 / 模式 preset」(AgentPresetSeat) 的气泡样式 */
const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  minHeight: 28,
  maxWidth: 240,
  padding: '0 8px',
  border: 'none',
  color: tk.text,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  lineHeight: '20px',
  whiteSpace: 'nowrap',
  transition: 'background-color .16s ease, color .16s ease',
} as const

const AURA_CLASS = 'dsh-studio-worktree-seat'

/** 注入 hover 椭圆形底色（inline style 无法表达 :hover）。 */
function ensureSeatStyle(): void {
  if (typeof document === 'undefined' || document.querySelector('#dsh-studio-worktree-seat-style') !== null) return
  const tag = document.createElement('style')
  tag.id = 'dsh-studio-worktree-seat-style'
  const sel = '.' + AURA_CLASS
  tag.textContent = sel + '\n{border-radius:16px;background:transparent}' + '\n' +
    sel + ':hover,' + sel + '[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}' + '\n'
  document.head.appendChild(tag)
}
const menuStyle = {
  boxSizing: 'border-box',
  position: 'absolute',
  zIndex: 30,
  top: 34,
  left: 0,
  minWidth: 220,
  padding: 6,
  border: `1px solid ${tk.border}`,
  borderRadius: 12,
  background: tk.panel,
  boxShadow: '0 8px 24px rgba(0,0,0,.18)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
} as const

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '7px 10px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  color: tk.text,
  cursor: 'pointer',
  font: 'inherit',
  textAlign: 'left',
} as const

function pathBase(path: string): string {
  const parts = path.split(/[\/]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
}

function branchOf(branch?: string): string {
  const prefix = 'refs/heads/'
  return branch !== undefined && branch.startsWith(prefix) ? branch.slice(prefix.length) : branch ?? ''
}

function optionLabel(e: WorktreeEntry): string {
  return branchOf(e.branch) || pathBase(e.path)
}



export function WorktreeSelector(props: Record<string, unknown>): unknown {
  const controller = props.controller as WorktreeController | undefined
  const useSessions = props.useSessions as ((sel: (snapshot: unknown) => unknown) => unknown) | undefined

  const currentSessionId = useSessions
    ? (useSessions((snapshot) => {
        const s = snapshot as { current?: string } | undefined
        return s?.current
      }) as string | undefined)
    : undefined

  const cwd = useSessions
    ? (useSessions((snapshot) => {
        const s = snapshot as { byId?: Record<string, { cwd?: string } | undefined>; current?: string } | undefined
        return s?.current !== undefined ? s.byId?.[s.current]?.cwd : undefined
      }) as string | undefined)
    : undefined

  const [list, setList] = useState<WorktreeList | null>(null)
  const [attribution, setAttribution] = useState<Attribution | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (controller === undefined || cwd === undefined || cwd === '') return
    let cancelled = false
    setList(null)
    setAttribution(null)
    setError('')
    void controller.list(cwd)
      .then((next) => { if (!cancelled) setList(next) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    void controller.attribution(cwd)
      .then((next) => { if (!cancelled) setAttribution(next) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [controller, cwd])

  if (controller === undefined || cwd === undefined || cwd === '') return null

  const currentLabel = attribution?.mode === 'worktree'
    ? (attribution.branch ?? 'worktree')
    : 'main'

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await fn()
      setOpen(false)
      setCreating(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const chooseMain = (): void => {
    const root = list?.root ?? attribution?.root
    if (root === undefined) return
    void run(() => controller.bindExisting(root))
  }

  const chooseWorktree = (entry: WorktreeEntry): void => {
    void run(() => controller.bindExisting(entry.path))
  }

  const createNew = (): void => {
    const root = list?.root ?? attribution?.root
    const name = branch.trim()
    if (root === undefined || name === '') { setError('请填分支名'); return }
    void run(() => controller.createAndBind({ cwd: root, branch: name }))
  }

  const linked = (list?.worktrees ?? []).filter((w) => !w.main)
  void currentSessionId
  ensureSeatStyle()

  return createElement('div', { style: { display: 'inline-flex', position: 'relative' } },
    createElement('button', {
      type: 'button',
      className: AURA_CLASS,
      style: chip,
      disabled: busy,
      onClick: () => setOpen((v) => !v),
      title: attribution?.mode === 'worktree' ? attribution.path : attribution?.root,
    },
      createElement(GitBranchIcon, {}),
      createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, currentLabel),
      createElement('span', { style: { color: tk.tertiary, flex: 'none', fontSize: 10 } }, '▾'),
    ),
    open
      ? createElement('div', { style: menuStyle },
          createElement('button', { type: 'button', style: itemStyle, disabled: busy, onClick: chooseMain },
            createElement('span', { style: { fontWeight: currentLabel === 'main' ? 600 : 400 } }, 'main'),
            createElement('span', { style: { color: tk.tertiary, fontSize: 11, marginLeft: 'auto' } },
              pathBase(list?.root ?? attribution?.root ?? '')),
          ),
          ...linked.map((entry) =>
            createElement('button', { key: entry.path, type: 'button', style: itemStyle, disabled: busy, onClick: () => chooseWorktree(entry) },
              createElement('span', { style: { fontWeight: currentLabel === optionLabel(entry) ? 600 : 400 } }, optionLabel(entry)),
            ),
          ),
          creating
            ? createElement('div', { style: { display: 'flex', gap: 6, padding: '4px 2px' } },
                createElement('input', {
                  value: branch,
                  autoFocus: true,
                  placeholder: '分支名',
                  style: {
                    flex: 1,
                    minWidth: 110,
                    height: 26,
                    padding: '0 9px',
                    border: `1px solid ${tk.border}`,
                    borderRadius: 999,
                    background: 'transparent',
                    color: tk.text,
                    font: 'var(--dsw-font-xs-13)',
                  },
                  onChange: (e: { target: { value: string } }) => setBranch(e.target.value),
                  onKeyDown: (e: { key: string }) => { if (e.key === 'Enter') createNew(); if (e.key === 'Escape') { setCreating(false); setBranch('') } },
                }),
                createElement('button', { type: 'button', style: { ...chip, color: tk.primary }, disabled: busy || branch.trim() === '', onClick: createNew }, busy ? '…' : '创建'),
              )
            : createElement('button', { type: 'button', style: { ...itemStyle, color: tk.primary }, disabled: busy, onClick: () => { setCreating(true) } },
                '+ 新建 worktree'),
          error
            ? createElement('div', { style: { color: tk.danger, fontSize: 11, padding: '4px 10px' } }, error)
            : null,
        )
      : null,
  )
}
