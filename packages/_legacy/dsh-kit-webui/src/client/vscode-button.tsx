/**
 * VS Code 打开按钮 —— React 侧只负责把当前会话 cwd 写到全局，
 * 不再渲染任何 DOM（按钮由 layout.ts 原生创建在右侧工具栏，避免闪烁）。
 */
import { createElement } from 'react'

interface Props {
  sessionId?: string | null
  useSessions?: (sel: (snapshot: unknown) => unknown) => unknown
}

declare global {
  interface Window {
    /** 当前会话的工作目录，供 layout.ts 原生按钮读取。 */
    __dshKitVscodeCwd?: string
  }
}

export function VscodeOpenButton(props: Props): unknown {
  const sessionId = String(props.sessionId ?? '')
  const useSessions = props.useSessions as ((sel: (snapshot: unknown) => unknown) => unknown) | undefined

  const cwd = useSessions
    ? (useSessions((snapshot) => {
        const s = snapshot as { byId?: Record<string, { cwd?: string } | undefined> } | undefined
        return s?.byId?.[sessionId]?.cwd
      }) as string | undefined)
    : undefined

  window.__dshKitVscodeCwd = cwd ?? ''
  return null
}
