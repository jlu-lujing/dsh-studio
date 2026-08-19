/** dsh-studio-lan-auth client.
 *
 * Local (loopback) browser: registers the 局域网鉴权 settings.section — the
 * token/user management page. Its admin routes are loopback-only, so it is
 * deliberately absent for remote clients.
 *
 * Remote (LAN) browser arriving through the HTTPS gateway: registers a logout
 * action in `sidebar.footer.action`. The gateway revokes the session token and
 * clears the cookie, returning the browser to its login page.
 */
import { Fragment, createElement, useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'

export const name = 'dsh-studio-lan-auth'

/**
 * Services the fiber waits on before apply. Cordis resolves `connection` so
 * `isLoopback` is authoritative at apply time (server ordering is otherwise
 * unconstrained — the wire client provides it, and the loader waits).
 */
export const inject = ['connection']

const T = { bg: 'rgba(128,128,128,0.07)', border: 'rgba(128,128,128,0.35)', danger: '#e06c75', ok: '#4caf7d', radius: 8, muted: 'rgba(128,128,128,0.7)' }
const inputS = { flex: 1, padding: '6px 10px', borderRadius: T.radius, border: '1px solid ' + T.border, background: T.bg }
const buttonS = { padding: '6px 12px', borderRadius: T.radius, border: '1px solid ' + T.border, background: T.bg, cursor: 'pointer' }
const boxS = { border: '1px solid ' + T.border, borderRadius: T.radius, background: T.bg, padding: 10 }

function useFetch() {
  const [data, setData] = useState<{ port?: number; users?: unknown[]; tokens?: unknown[] } | null>(null)
  const [err, setErr] = useState('')
  const refresh = () => {
    fetch('/dsh-studio-lan-auth/status')
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setErr(String((e && e.message) || e)))
  }
  useEffect(refresh, [])
  return { data, err, setErr, refresh }
}

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers: {} }
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  const res = await fetch(path, opts)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d && (d.error || d.message)) || 'HTTP ' + res.status)
  return d
}

function LanAuthPage() {
  const { data, err, setErr, refresh } = useFetch()
  const [userF, setUserF] = useState({ username: '', password: '' })
  const [tokenF, setTokenF] = useState({ name: '' })
  const [newToken, setNewToken] = useState<{ token: string; expiresAt?: string } | null>(null)

  const addUser = () => {
    setErr('')
    api('POST', '/dsh-studio-lan-auth/users', userF)
      .then(() => setUserF({ username: '', password: '' }))
      .then(refresh)
      .catch((e) => setErr(String((e && e.message) || e)))
  }
  const delUser = (id: unknown) => {
    if (!window.confirm('确定删除该用户？')) return
    api('POST', '/dsh-studio-lan-auth/users/delete', { id }).then(refresh).catch((e) => setErr(String((e && e.message) || e)))
  }
  const addToken = () => {
    setErr(''); setNewToken(null)
    api('POST', '/dsh-studio-lan-auth/tokens', tokenF)
      .then((r) => {
        const tk = (r as { token: { token: string; expiresAt?: string } }).token
        setNewToken({ token: tk.token, expiresAt: tk.expiresAt })
        setTokenF({ name: '' })
      })
      .then(refresh)
      .catch((e) => setErr(String((e && e.message) || e)))
  }
  const delToken = (id: unknown) => {
    if (!window.confirm('确定删除该 token？')) return
    api('POST', '/dsh-studio-lan-auth/tokens/delete', { id }).then(refresh).catch((e) => setErr(String((e && e.message) || e)))
  }

  const row = (label: string, ctrl: unknown, k: string) =>
    createElement('div', { key: k, style: { display: 'flex', gap: 6, alignItems: 'center' } },
      createElement('label', { style: { width: 76, fontSize: 12, opacity: 0.8 } }, label), ctrl)

  const users = (data?.users ?? []) as Array<{ id: string; username: string }>
  const tokens = (data?.tokens ?? []) as Array<{ id: string; name: string; lastUsedAt: string; createdAt: string; expiresAt?: string }>

  const fmtExpiry = (iso: string | undefined): string => {
    if (!iso) return ''
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return ''
    const when = new Date(iso).toLocaleString()
    const now = Date.now()
    if (t <= now) return `已过期于 ${when}`
    const ms = t - now
    const h = Math.floor(ms / 3600000)
    const d = Math.floor(h / 24)
    if (d > 0) return `约 ${d} 天后过期（${when}）`
    if (h > 0) return `约 ${h} 小时后过期（${when}）`
    return `约 ${Math.max(1, Math.floor(ms / 60000))} 分钟后过期`
  }

  void row

  return createElement('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 } },
    createElement('div', { style: { fontSize: 15, fontWeight: 600 } }, '局域网鉴权（dsh-studio-lan-auth）'),
    createElement('div', { style: { fontSize: 12, opacity: 0.8 } },
      '自签名 HTTPS 网关。本机（localhost）免登录直接访问；局域网访问需携带有效 token 或登录。网关端口：' +
      (data && data.port ? String(data.port) : '…')),
    createElement('div', { style: boxS },
      createElement('div', { style: { marginBottom: 6, fontSize: 13, fontWeight: 600 } }, '已配置的用户'),
      users.length
        ? users.map((u) => createElement('div', { key: u.id, style: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid ' + T.border } },
            createElement('div', { style: { flex: 1, fontSize: 13 } }, u.username),
            createElement('button', { style: buttonS, onClick: () => delUser(u.id) }, '删除')))
        : createElement('div', { style: { opacity: 0.6, fontSize: 12 } }, '还没有用户。'),
      createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
        createElement('input', { value: userF.username, onChange: (e) => setUserF({ ...userF, username: e.target.value }), placeholder: '用户名', style: { ...inputS, maxWidth: 180 } }),
        createElement('input', { type: 'password', value: userF.password, onChange: (e) => setUserF({ ...userF, password: e.target.value }), placeholder: '密码', style: { ...inputS, maxWidth: 180 } }),
        createElement('button', { style: { ...buttonS, fontWeight: 700 }, onClick: addUser, disabled: !userF.username.trim() || !userF.password }, '添加用户'),
      ),
    ),
    createElement('div', { style: boxS },
      createElement('div', { style: { marginBottom: 6, fontSize: 13, fontWeight: 600 } }, '访问 Token'),
      tokens.length
        ? tokens.map((t) => createElement('div', { key: t.id, style: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid ' + T.border } },
            createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
              createElement('div', { style: { fontSize: 13, color: t.expiresAt && new Date(t.expiresAt).getTime() <= Date.now() ? T.danger : undefined } }, t.name),
              createElement('div', { style: { fontSize: 11, opacity: 0.65 } },
                (fmtExpiry(t.expiresAt) ? fmtExpiry(t.expiresAt) + ' · ' : '') + 'last: ' + new Date(t.lastUsedAt).toLocaleString()),
            ),
            createElement('button', { style: buttonS, onClick: () => delToken(t.id) }, '删除')))
        : createElement('div', { style: { opacity: 0.6, fontSize: 12 } }, '还没有 token。'),
      newToken
        ? createElement('div', { style: { marginTop: 8, padding: 8, borderRadius: T.radius, background: 'rgba(76,175,125,0.12)', fontSize: 12 } },
            '新 token（只显示一次）：', createElement('code', { style: { wordBreak: 'break-all' } }, newToken.token),
            newToken.expiresAt ? createElement('div', { style: { marginTop: 4, opacity: 0.8 } }, fmtExpiry(newToken.expiresAt)) : null)
        : null,
      createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
        createElement('input', { value: tokenF.name, onChange: (e) => setTokenF({ name: e.target.value }), placeholder: 'token 名称', style: { ...inputS, maxWidth: 200 } }),
        createElement('button', { style: { ...buttonS, fontWeight: 700 }, onClick: addToken }, '生成 Token'),
      ),
    ),
    err ? createElement('div', { style: { color: T.danger, fontSize: 13 } }, err) : null,
  )
}

/**
 * Sidebar-foot logout action for remote (LAN) sessions over the HTTPS gateway.
 * Local/loopback access renders no button: there is no session to end — the
 * gateway lets loopback traffic through without credentials, so "logout"
 * would be meaningless (and the management settings page only appears locally).
 *
 * The button styles follow the sidebar's own footer-action badge (the Cordis
 * panel entry sets the precedent): a full-width, hover-highlighted pill with a
 * 14px label in wide mode and a centered 36px round icon in the collapsed rail.
 * It uses the web app's `--dsw-*` tokens so it re-skins with the theme.
 *
 * Clicking asks for confirmation; on confirm it revokes the current session
 * token (the gateway route invalidates it) and clears the session cookie,
 * then walks the browser back to the login page.
 */
function LogoutButton({ wide }: { wide: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  /** Actually perform the logout (only after the user confirms). */
  const runLogout = () => {
    if (busy) return
    setConfirming(false)
    setBusy(true)
    setFailed(false)
    // Only walk back to the login page when the gateway confirms logout
    // (200 + cookie cleared). A failure — e.g. a gateway still running the
    // pre-logout build that answers 405 — must NOT navigate: the session
    // cookie is still valid there, so reloading "/" would silently re-login.
    fetch('/__dsh_studio_lan_logout', {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
      .then((res) => {
        if (res.ok) { window.location.assign('/'); return }
        setFailed(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setBusy(false))
  }
  const cancel = () => { if (!busy) setConfirming(false) }
  const onClick = () => {
    if (busy) return
    setFailed(false)
    setConfirming(true)
  }
  const style: Record<string, string> = {
    width: wide ? '100%' : '36px',
    height: '36px',
    color: 'var(--dsw-alias-label-tertiary)',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    borderRadius: wide ? '12px' : '50%',
    alignItems: 'center',
    justifyContent: wide ? 'flex-start' : 'center',
    gap: '8px',
    padding: wide ? '0 8px 0 6px' : '0',
    fontFamily: 'inherit',
    fontSize: '14px',
    lineHeight: '1',
    display: 'inline-flex',
    transition: 'background .15s var(--ds-ease-in-out, ease)',
    opacity: busy ? 0.6 : 1,
  }
  return createElement(Fragment,
    null,
    createElement('button', {
      type: 'button',
      style,
      onClick,
      disabled: busy,
      'aria-label': '退出登录',
      title: failed ? '退出登录失败，请重试' : '退出登录',
    },
      createElement(LogoutIcon, null),
      wide ? createElement('span', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, failed ? '退出登录失败' : '退出登录') : null,
    ),
    createElement(Modal, {
      open: confirming,
      onClose: cancel,
      closeLabel: '关闭',
      title: '确认退出登录',
      description: '退出后将返回登录页，需要重新输入账号密码或 Token 才能继续访问。',
      footer: createElement(Fragment, null,
        createElement(Button, { variant: 'outline', onClick: cancel }, '取消'),
        createElement(Button, { variant: 'primary', onClick: runLogout }, '确认退出'),
      ),
    }),
  )
}

/** Inline logout glyph (door + exit arrow) matching the 16px sidebar icon scale. */
function LogoutIcon() {
  return createElement('svg', {
    width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true,
  },
    createElement('path', { d: 'M7 3 H3.5 a.5.5 0 0 0-.5.5 v9 a.5.5 0 0 0 .5.5 H7' }),
    createElement('path', { d: 'M10 5.5 12.5 8 10 10.5' }),
    createElement('path', { d: 'M12.5 8 H6.5' }),
  )
}

export function apply(ctx: { get(name: string): unknown }): void {
  const slots = ctx.get('slots') as { inject(name: string, fn: () => unknown): unknown; register(...a: unknown[]): unknown } | undefined
  if (slots === undefined) return
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  if (connection === undefined) return

  if (connection.isLoopback) {
    // Host-only management surface: the admin routes are loopback-only, so a
    // remote client gets nothing useful here — keep the section off their page.
    slots.inject('settings.section', () =>
      slots.register({ name: 'settings.section', id: 'dsh-studio-lan-auth', priority: 40, label: () => '局域网鉴权' }, () => createElement(LanAuthPage, null)),
    )
    return
  }

  // Remote (LAN) session: offer logout at the sidebar foot.
  slots.inject('sidebar.footer.action', () =>
    slots.register({ name: 'sidebar.footer.action', id: 'dsh-studio-lan-auth-logout' }, (owner: { wide: boolean }) => createElement(LogoutButton, { wide: owner.wide })),
  )
}
