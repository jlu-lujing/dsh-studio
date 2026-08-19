/**
 * 会话标题旁的 worktree 小标签（conversation.session.header.actions）。
 *
 * 样式完整对齐官方「满血模式」标签（AgentPresetLabel）：
 *   .SVAs4q_label = fill-tsp-secondary / height:22 / radius:6px / font-size:12 /
 *   color:label-secondary / icon opacity:.7
 * 只读显示当前对话在哪个 worktree（main / 分支）。
 */

import { createElement, useEffect, useState } from 'react'
import { GitBranchIcon } from './icon.ts'
import type { Attribution, WorktreeController } from './controller.ts'

const labelStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  maxWidth: 180,
  height: 22,
  padding: '0 2px 0 0',
  border: 'none',
  borderRadius: 6,
  background: 'var(--dsw-alias-fill-tsp-secondary)',
  color: 'var(--dsw-alias-label-secondary)',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 400,
  lineHeight: '22px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
} as const

/** 满血模式标签图标是 opacity:.7 的线性 icon。 */
function iconColor(): string {
  return 'var(--dsw-alias-label-secondary)'
}

export function WorktreeBadge(props: Record<string, unknown>): unknown {
  const sessionId = String(props.sessionId ?? '')
  const controller = props.controller as WorktreeController | undefined
  const useSessions = props.useSessions as ((sel: (snapshot: unknown) => unknown) => unknown) | undefined

  const cwd = useSessions
    ? (useSessions((snapshot) => {
        const s = snapshot as { byId?: Record<string, { cwd?: string } | undefined> } | undefined
        return s?.byId?.[sessionId]?.cwd
      }) as string | undefined)
    : undefined

  const [attribution, setAttribution] = useState<Attribution | null>(null)

  useEffect(() => {
    if (controller === undefined || cwd === undefined || cwd === '') {
      setAttribution(null)
      return
    }
    let cancelled = false
    setAttribution(null)
    void controller.attribution(cwd)
      .then((next) => { if (!cancelled) setAttribution(next) })
      .catch(() => { if (!cancelled) setAttribution({ mode: 'main', root: cwd }) })
    return () => { cancelled = true }
  }, [controller, cwd])

  if (controller === undefined || cwd === undefined || cwd === '' || attribution === null) return null

  const label = attribution.mode === 'worktree'
    ? (attribution.branch ?? 'worktree')
    : 'main'
  const title = attribution.mode === 'worktree'
    ? `worktree: ${attribution.path ?? ''}`
    : `main: ${attribution.root ?? cwd}`

  return createElement('span', { style: labelStyle, title },
    createElement('span', { style: { opacity: 0.7, flex: 'none', display: 'inline-flex' } },
      createElement(GitBranchIcon, { size: 13, color: iconColor() }),
    ),
    createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, label),
  )
}
