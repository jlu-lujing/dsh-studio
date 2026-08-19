/**
 * 共享线性简笔画图标（无 emoji）。
 * 风格对齐 DSH 官方 outline icon：stroke 线性、圆头端点、flex:none。
 */

import { createElement } from 'react'

/** git-branch 图标（用于 worktree 选择器/徽标/dock）。 */
export function GitBranchIcon(options: { size?: number; color?: string }): unknown {
  const size = options.size ?? 14
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: options.color ?? 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    style: { flex: 'none' },
  },
    createElement('line', { x1: '6', y1: '3', x2: '6', y2: '15' }),
    createElement('circle', { cx: '18', cy: '6', r: '3' }),
    createElement('circle', { cx: '6', cy: '18', r: '3' }),
    createElement('path', { d: 'M18 9a9 9 0 0 1-9 9' }),
  )
}
