/**
 * dsh-studio-input-history, client half.
 *
 * 记录当前会话里用户「已发送」的消息，并在输入框无命令菜单占用时，用
 * ↑ / ↓ 直接在输入框回填历史。每个会话（sessionId）单独记录，存 localStorage。
 *
 * 设计约束（避免破坏官方输入机）：
 * - 通过官方输入机唯一公开回填通道 `inputActions.setDraft(text)` 写回，
 *   绝不直接改 textarea DOM。
 * - 只在「输入框聚焦 + 非 IME 组合输入 + draft 无命令/引用前缀」时接管
 *   ↑/↓；否则完全放行给官方 InputBar（命令菜单导航、光标移动等不受影响）。
 * - 挂载点是官方 `conversation.composer.dock` 槽位（session 作用域，能从
 *   SessionStandardProps 拿 useSession / inputActions）。
 */
import { createElement, useEffect, useRef, useState } from 'react'

export const name = 'dsh-studio-input-history'

/** Wire/connection 服务，保证只能在本机会话内使用（与 lan-auth 一致）。 */
export const inject = ['connection']

/** localStorage key 前缀（按 session 分桶）。 */
const LS_PREFIX = 'dsh-studio.input-history.'
const MAX_HISTORY = 100

function storageKey(sessionId: string): string {
  return LS_PREFIX + sessionId
}

function loadHistory(sessionId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

function saveHistory(sessionId: string, history: string[]): void {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(history))
  } catch {
    // 存储满 / 隐私模式等失败时静默忽略（历史只是增强功能）
  }
}

/** 从会话 snapshot 提取全部「用户已发送」的纯文本消息（按出现顺序）。 */
function collectUserMessages(session: unknown): string[] {
  const nodes = (session as { nodes?: unknown })?.nodes
  if (!Array.isArray(nodes)) return []
  const out: string[] = []
  for (const node of nodes) {
    const n = node as { kind?: string; content?: Array<{ type?: string; text?: string }> }
    if (n?.kind !== 'user' || !Array.isArray(n.content)) continue
    const text = n.content
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
    if (text.trim() !== '') out.push(text)
  }
  return out
}

/**
 * 组件挂在输入框下方（conversation.composer.dock）。可见 UI 极简——只在
 * 有历史时显示一行小提示；实际键盘接管通过全局 capture 级 keydown 实现。
 */
export function apply(ctx: { get(name: string): unknown }): void {
  const slots = ctx.get('slots') as {
    inject(name: string, fn: () => unknown): unknown
    register(...a: unknown[]): unknown
  } | undefined
  if (slots === undefined) return

  slots.inject('conversation.composer.dock', () =>
    slots.register({
      name: 'conversation.composer.dock',
      id: 'dsh-studio-input-history',
      priority: 40,
    }, (props: Record<string, unknown>) => createElement(InputHistoryDock, props)),
  )
}

/**
 * 只渲染一个零侵入的 status 小字（多数时候为空），并把键盘/记录逻辑
 * 放在 effects 里（不产生可见 UI 需要被点击的目标）。
 */
function InputHistoryDock(props: Record<string, unknown>): unknown {
  const sessionId = String(props.sessionId ?? '')
  const inputActions = props.inputActions as { setDraft(text: string): void } | undefined
  // useSession 由 runtime 的 session standard kit 提供（类型自包含，宽松处理）。
  const useSession = (props as { useSession?: (sel: unknown) => unknown }).useSession
  const latestUserMessage = useSession
    ? (useSession((s: unknown) => {
        const msgs = collectUserMessages(s)
        return msgs.length > 0 ? msgs[msgs.length - 1] : ''
      }) as string)
    : ''

  // 当前已按 ↑/↓ 定位到的历史序号（null = 未在浏览历史）。
  const cursorRef = useRef<number | null>(null)

  // 会话里出现新的用户消息 → 追加进历史（按 session 单独存）。
  useEffect(() => {
    if (!sessionId || !latestUserMessage) return
    const history = loadHistory(sessionId)
    const last = history.length > 0 ? history[history.length - 1] : ''
    if (latestUserMessage === last) return
    const next = [...history.filter((h) => h !== latestUserMessage), latestUserMessage]
    saveHistory(sessionId, next.slice(-MAX_HISTORY))
    // 新消息送出后重置浏览游标。
    cursorRef.current = null
  }, [sessionId, latestUserMessage])

  // 全局 capture 级 keydown：接管输入框中的 ↑/↓ 历史切换。
  useEffect(() => {
    if (!sessionId || !inputActions) return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      // 只在真正的输入框（textarea 且可见）聚焦时接管。
      const el = document.activeElement
      if (!(el instanceof HTMLTextAreaElement)) return
      if (e.isComposing) return
      const value = el.value
      // 输入框非空且以 / 或 @ 打头 → 命令/引用菜单占用，放行官方逻辑。
      if (value.trim().startsWith('/') || value.trim().startsWith('@')) return

      const history = loadHistory(sessionId)
      if (history.length === 0) return

      const isUp = e.key === 'ArrowUp'
      let cursor: number | null = cursorRef.current

      if (isUp) {
        if (cursor === null) {
          // 首次按 ↑：从空输入直接取最新一条历史（不再递减）；若输入框
          // 已有文本，先定位到该文本在历史中的位置，未命中则当最新条处理。
          if (value.trim() === '') {
            cursor = history.length - 1
          } else {
            cursor = history.indexOf(value)
            if (cursor === -1) cursor = history.length - 1
          }
          cursorRef.current = cursor
          inputActions.setDraft(history[cursor])
          e.preventDefault()
          e.stopImmediatePropagation()
          return
        }
        // 已在浏览历史：↑ 向更旧的条目移动。
        if (cursor > 0) {
          cursor -= 1
        } else {
          // 已到最旧一条：不阻止（让浏览器默认光标行为接管）。
          cursorRef.current = cursor
          return
        }
      } else {
        if (cursor === null) return
        if (cursor < history.length - 1) {
          cursor += 1
        } else {
          // 已到最新一条：↓ 清空回退到空输入，并退出历史浏览。
          cursorRef.current = null
          inputActions.setDraft('')
          e.preventDefault()
          e.stopImmediatePropagation()
          return
        }
      }

      cursorRef.current = cursor
      inputActions.setDraft(history[cursor])
      e.preventDefault()
      e.stopImmediatePropagation()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [sessionId, inputActions])

  // 不渲染任何可见 UI：只保留记录与 ↑/↓ 键盘逻辑（纯功能、零侵入）。
  return null
}
