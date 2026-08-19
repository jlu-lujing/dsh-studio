/**
 * dsh-studio host plugin (桌面通知).
 *
 * Listens to DSH's durable session events and posts a native desktop
 * notification when a conversational turn settles — a completed turn is the
 * "task finished" signal, and non-completed endings (error/aborted/blocked/
 * max-tokens) get their own message so the user notices when something needs
 * attention. Zero npm dependencies: the notification goes through the
 * platform's own tooling (`osascript` on macOS, `notify-send` on Linux,
 * PowerShell + Windows.UI.Notifications on Windows), executed via
 * `child_process.execFile` with no shell.
 */

import { execFile } from 'node:child_process'

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

/** Cordis plugin name. */
export const name = 'dsh-studio-notifier'

export interface Config {
  /** Whether to enable notifications at all (default true). */
  enabled?: boolean
  /** Only notify when the turn ended for one of these reasons (default: all). */
  notifyOn?: Array<'completed' | 'error' | 'aborted' | 'blocked' | 'max-tokens'>
}

/** Render a desktop notification on the current platform (best effort). */
function notify(title: string, body: string): void {
  const plat = process.platform
  // macOS notification center via AppleScript (no shell).
  if (plat === 'darwin') {
    const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`
    execFile('osascript', ['-e', script], () => {})
    return
  }
  // Linux desktop notification via libnotify (no shell).
  if (plat === 'linux' && process.env.DISPLAY !== undefined) {
    execFile('notify-send', [title, body], () => {})
    return
  }
  // Windows toast via PowerShell + Windows.UI.Notifications (Win10+).
  if (plat === 'win32') {
    // Title/body are carried through environment variables, NOT interpolated
    // into the -Command string: $ and backtick are PowerShell metacharacters,
    // so inlining strings (even JSON-escaped) is an injection surface and
    // `$env:PATH`-style variable expansion would leak into the toast text.
    const ps = [
      '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null',
      '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] | Out-Null',
      '$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
      '$texts = $template.GetElementsByTagName("text")',
      '$title = [Environment]::GetEnvironmentVariable("DSH_STUDIO_TOAST_TITLE")',
      '$body = [Environment]::GetEnvironmentVariable("DSH_STUDIO_TOAST_BODY")',
      '$texts.Item(0).AppendChild($template.CreateTextNode([string]$title)) | Out-Null',
      '$texts.Item(1).AppendChild($template.CreateTextNode([string]$body)) | Out-Null',
      '$toast = New-Object Windows.UI.Notifications.ToastNotification($template)',
      '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("dsh-studio").Show($toast)',
    ].join('; ')
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      env: { ...process.env, DSH_STUDIO_TOAST_TITLE: title, DSH_STUDIO_TOAST_BODY: body },
    }, () => {})
    return
  }
  // Unsupported platform: silently skip (nothing to do).
}

/** Human label for a turn-end reason (Chinese product copy). */
function reasonLabel(reason: string): string {
  switch (reason) {
    case 'completed': return '任务完成'
    case 'error': return '任务出错'
    case 'aborted': return '任务已取消'
    case 'blocked': return '任务被阻塞（需你授权）'
    case 'max-tokens': return '达到 token 上限'
    default: return '回合结束'
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  if (config.enabled === false) return
  const reasons = new Set(config.notifyOn ?? ['completed', 'error', 'aborted', 'blocked', 'max-tokens'])

  ctx.on('session/event', (_session: Session, event: SessionEvent) => {
    if (event.type !== 'turn/end') return
    const kind = event.data.reason.kind
    if (!reasons.has(kind)) return
    const title = 'dsh-studio'
    const body = `${reasonLabel(kind)}（第 ${event.data.turn} 回合）`
    notify(title, body)
  })
}
