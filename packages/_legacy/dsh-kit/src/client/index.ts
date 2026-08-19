/** dsh-kit client: feature store panel in the sidebar footer (开箱即用的功能开关). */

import { createElement, useEffect, useState } from 'react'

export const name = 'dsh-kit'

/** Required wire-facing service so the panel can read loopback state (mirrors lan-auth). */
export const inject = ['connection', 'locale']

interface Feature {
  id: string
  name: string
  description: string
  enabled: boolean
  /** Whether this feature can be installed/removed directly from the store. */
  installable: boolean
  /** Whether the store offers an enable/disable toggle (false for preset installers). */
  togglable: boolean
  /** Whether the on-disk artifact is currently installed (installable only). */
  installed: boolean
}

/* Design-token palette. Consuming --dsw-alias-* matches the host web app's
 * settings pages & the lan-auth settings.section, so the panel re-skins with
 * light/dark and stays consistent with every other settings section. */
const tk = {
  text: 'var(--dsw-alias-label-primary)',
  secondary: 'var(--dsw-alias-label-secondary)',
  tertiary: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l2)',
  cardBg: 'var(--dsw-alias-bg-layer-3)',
  btnBg: 'var(--dsw-alias-label-primary)',
  btnText: 'var(--dsw-alias-bg-layer-3)',
  success: 'var(--dsw-alias-state-success-primary)',
  successBg: 'var(--dsw-alias-state-success-tertiary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  dangerBg: 'var(--dsw-alias-interactive-bg-hover-danger)',
  radius: 12,
}

const cardS = { border: '1px solid ' + tk.border, borderRadius: tk.radius, background: tk.cardBg }
const ghostBtn = {
  padding: '5px 12px', borderRadius: 8, border: '1px solid ' + tk.border,
  background: 'transparent', color: tk.secondary, font: 'inherit', fontSize: 13, lineHeight: 1.5,
  cursor: 'pointer', whiteSpace: 'nowrap',
}
const primaryBtn = {
  padding: '5px 14px', borderRadius: 8, border: '1px solid transparent',
  background: tk.btnBg, color: tk.btnText, font: 'inherit', fontSize: 13, lineHeight: 1.5,
  cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600,
}
const badgeS = (on: boolean) => ({
  flex: 'none', display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
  borderRadius: 999, fontSize: 11, lineHeight: '20px', fontWeight: 500, whiteSpace: 'nowrap',
  background: on ? tk.successBg : tk.dangerBg,
  color: on ? tk.success : tk.danger,
})

function useStore() {
  const [features, setFeatures] = useState<Feature[] | null>(null)
  const [err, setErr] = useState('')
  const refresh = () => {
    fetch('/dsh-kit/store')
      .then((r) => r.json())
      .then((d) => setFeatures((d as { features: Feature[] }).features))
      .catch((e) => setErr(String((e && e.message) || e)))
  }
  useEffect(refresh, [])
  return { features, err, setErr, refresh }
}

async function api(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d && (d.error || d.message)) || 'HTTP ' + res.status)
  return d
}

/** One GitHub `topic:dsh-plugin` repository, shown read-only in the store. */
interface EcosystemEntry {
  full_name: string
  owner: string
  name: string
  description: string
  stars: number
  language: string | null
  license: string | null
  html_url: string
  updated_at: string
  archived: boolean
}

interface EcosystemState {
  ok: boolean
  total: number
  entries: EcosystemEntry[]
  fetched: number
  partial: boolean
  cachedAt: number
  source: 'cache' | 'live' | 'fallback'
}

function useEcosystem() {
  const [data, setData] = useState<EcosystemState | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = (force = false) => {
    setLoading(true)
    fetch(`/dsh-kit/store/ecosystem${force ? '?refresh=1' : ''}`)
      .then((r) => r.json())
      .then((d) => { setData(d as EcosystemState); setErr('') })
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  // 目录还在后台补全时，定时再取一次（直到拿满或回退为 fallback 快照）。
  useEffect(() => {
    if (!data?.partial || data.source === 'fallback') return
    const timer = setTimeout(() => refresh(), 30_000)
    return () => clearTimeout(timer)
  }, [data?.partial, data?.fetched])

  return { data, err, loading, refresh }
}

function fmtStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

function EcosystemCard({ entry }: { entry: EcosystemEntry }) {
  const meta = [
    entry.language,
    entry.license,
    entry.archived ? 'archived' : null,
  ].filter((v): v is string => Boolean(v)).join(' · ')

  return createElement('a', {
    key: entry.full_name,
    href: entry.html_url,
    target: '_blank',
    rel: 'noreferrer',
    title: entry.full_name,
    style: {
      ...cardS, display: 'flex', flexDirection: 'column', gap: 6, padding: 12,
      minWidth: 0, textDecoration: 'none', color: tk.text,
    },
  },
    createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
      createElement('div', {
        style: {
          flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        },
      }, `${entry.owner}/${entry.name}`),
      createElement('span', {
        style: {
          flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 11, lineHeight: '18px', color: tk.tertiary,
          fontVariantNumeric: 'tabular-nums',
        },
      }, '★', fmtStars(entry.stars)),
    ),
    createElement('div', {
      style: {
        fontSize: 12, lineHeight: 1.5, color: tk.tertiary,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
    }, entry.description || '(无简介)'),
    meta
      ? createElement('div', { style: { fontSize: 11, lineHeight: 1.5, color: tk.tertiary, marginTop: 'auto' } }, meta)
      : null,
  )
}

function EcosystemSection({ data, err, loading, limit, onRefresh, onMore }: {
  data: EcosystemState | null
  err: string
  loading: boolean
  limit: number
  onRefresh: () => void
  onMore: () => void
}) {
  const entries = data?.entries ?? []
  const visible = entries.slice(0, limit)
  const shown = data ? Math.min(entries.length, limit) : 0

  return createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 } },
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      createElement('div', { style: { flex: 1, minWidth: 0 } },
        createElement('div', { style: { fontSize: 15, fontWeight: 600 } }, 'GitHub 生态插件'),
        createElement('div', { style: { fontSize: 12, color: tk.tertiary, marginTop: 2 } },
          `topic:dsh-plugin · 只读展示，安装方式请打开仓库查看 README${data ? ` · 已展示 ${shown}${data.partial ? ` / ${data.fetched}` : ''} 个` : ''}`),
      ),
      createElement('button', {
        style: { ...ghostBtn, cursor: loading ? 'wait' : 'pointer' },
        onClick: onRefresh,
        disabled: loading,
      }, loading ? '刷新中…' : '刷新'),
    ),
    data?.source === 'fallback'
      ? createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '当前显示内置快照（GitHub 网络受限），点击刷新重试。')
      : null,
    data?.partial && data.source !== 'fallback'
      ? createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '正在后台补全完整目录，稍后会自动刷新…')
      : null,
    err
      ? createElement('div', { style: { fontSize: 12, color: tk.danger } }, err)
      : null,
    visible.length > 0
      ? createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 } },
          visible.map((entry) => createElement(EcosystemCard, { key: entry.full_name, entry })),
        )
      : loading
        ? createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '加载中…')
        : null,
    entries.length > limit
      ? createElement('button', { style: { ...ghostBtn, alignSelf: 'flex-start' }, onClick: onMore }, `再展示 100 个（共 ${entries.length}）`)
      : null,
  )
}

function StorePanel() {
  const { features, err, setErr, refresh } = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installMsg, setInstallMsg] = useState<string | null>(null)
  const ecosystem = useEcosystem()
  const [ecoLimit, setEcoLimit] = useState(100)

  const toggle = (f: Feature) => {
    setErr(''); setBusy(f.id)
    api(`/dsh-kit/store/${f.id}`, { enabled: !f.enabled })
      .then(refresh)
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setBusy(null))
  }

  const installArtifact = (f: Feature) => {
    setErr(''); setBusy(f.id)
    api(`/dsh-kit/store/${f.id}/install`, {})
      .then(refresh)
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setBusy(null))
  }

  const deleteArtifact = (f: Feature) => {
    if (!window.confirm(`确定删除 ${f.name} 的已安装文件（~/.dsh/.agent-presets/boost-mode）？`)) return
    setErr(''); setBusy(f.id)
    api(`/dsh-kit/store/${f.id}/delete`, {})
      .then(refresh)
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setBusy(null))
  }

  const installAll = () => {
    setErr(''); setInstallMsg(null); setInstalling(true)
    api('/dsh-kit/store/install', {})
      .then((r) => setInstallMsg(`已安装到 ${(r as { profile?: string }).profile ?? '当前'} 环境，重启后全部功能生效。`))
      .catch((e) => setInstallMsg(`安装失败：${String((e && e.message) || e)}`))
      .finally(() => setInstalling(false))
  }

  const rows = features ?? []
  // Layout mirrors the host settings sections (e.g. lan-auth / plugins): a
  // max-width column on `bg-layer-1` with heading, intro, and card rows.
  return createElement('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760, color: tk.text } },
    createElement('div', { style: { fontSize: 15, fontWeight: 600 } }, 'dsh-kit 功能商店'),
    createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '启停功能，重启后保留。'),
    createElement('div', { style: { ...cardS, padding: 12, display: 'flex', gap: 10, alignItems: 'center' } },
      createElement('div', { style: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.5, color: tk.secondary } },
        installMsg ?? '一键将全家桶安装到当前环境，装完即可开箱即用。'),
      createElement('button', {
        style: { ...primaryBtn, cursor: installing || busy !== null ? 'wait' : 'pointer' },
        onClick: installAll,
        disabled: busy !== null || installing,
      }, installing ? '安装中…' : '一键安装'),
    ),
    rows.length === 0 && !err
      ? createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '加载中…')
      : null,
    rows.map((f) =>
      createElement('div', { key: f.id, style: { ...cardS, padding: 12, display: 'flex', gap: 12, alignItems: 'center' } },
        createElement('div', { style: { flex: 1, minWidth: 0 } },
          createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: tk.text } },
            f.name,
            createElement('span', { style: badgeS(f.enabled) }, f.enabled ? '开' : '关'),
          ),
          createElement('div', { style: { fontSize: 13, lineHeight: 1.5, color: tk.tertiary, marginTop: 2 } }, f.description),
          f.installable
            ? createElement('div', { style: { fontSize: 12, lineHeight: 1.5, color: tk.tertiary, marginTop: 4 } }, f.installed ? '已安装到预设目录' : '未安装')
            : null,
        ),
        createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' } },
          f.togglable
            ? createElement('button', {
                style: { ...ghostBtn, cursor: busy === f.id ? 'wait' : 'pointer' },
                onClick: () => toggle(f),
                disabled: busy !== null,
              }, busy === f.id ? '…' : (f.enabled ? '停用' : '启用'))
            : null,
          f.installable
            ? createElement('button', {
                style: { ...ghostBtn, cursor: busy === f.id ? 'wait' : 'pointer' },
                onClick: () => f.installed ? deleteArtifact(f) : installArtifact(f),
                disabled: busy !== null,
              }, busy === f.id ? '…' : (f.installed ? '删除' : '安装'))
            : null,
        ),
      ),
    ),
    createElement(EcosystemSection, {
      data: ecosystem.data,
      err: ecosystem.err,
      loading: ecosystem.loading,
      limit: ecoLimit,
      onRefresh: () => ecosystem.refresh(true),
      onMore: () => setEcoLimit((n) => n + 100),
    }),
    err ? createElement('div', { style: { color: tk.danger, fontSize: 13 } }, err) : null,
  )
}

/* ── 归档会话管理面板 ─────────────────────────────────────────────── */

interface ArchivedItem {
  sessionId: string
  workspaceTitle?: string
  workspacePath?: string
  onDisk: boolean
  mtimeMs: number
}

function fmtTime(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function useArchived() {
  const [items, setItems] = useState<ArchivedItem[] | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const refresh = () => {
    fetch('/dsh-kit/archive/sessions')
      .then((r) => r.json())
      .then((d) => setItems(((d as { items?: ArchivedItem[] }).items) ?? []))
      .catch((e) => setErr(String((e && e.message) || e)))
  }
  useEffect(refresh, [])
  return { items, err, setErr, note, setNote, refresh }
}

function ArchivePanel() {
  const { items, err, setErr, note, setNote, refresh } = useArchived()
  const [busy, setBusy] = useState<string | null>(null)

  const act = (id: string, action: 'restore' | 'delete', label: string) => {
    if (action === 'delete' && !window.confirm(`确定删除归档会话 ${id} 吗？该操作会删除 ~/.dsh/sessions 下的对应日志，不可恢复。`)) return
    setErr(''); setNote(''); setBusy(id)
    api(`/dsh-kit/archive/${id}/${action}`, {})
      .then(() => { setNote(`${label}成功，重启 dsh 后列表与侧边栏生效。`); refresh() })
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setBusy(null))
  }

  const deleteAll = () => {
    if (!window.confirm('确定删除【全部】归档会话吗？这会永久删除所有归档会话的日志文件（~/.dsh/sessions 下），不可恢复。')) return
    setErr(''); setNote(''); setBusy('*all*')
    api('/dsh-kit/archive/delete-all', {})
      .then((r) => {
        const cnt = (r as { deleted?: number }).deleted ?? 0
        setNote(`已删除全部 ${cnt} 个归档会话，重启 dsh 后侧边栏同步。`)
        refresh()
      })
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setBusy(null))
  }

  const rows = items ?? []
  return createElement('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760, color: tk.text } },
    createElement('div', { style: { fontSize: 15, fontWeight: 600 } }, '归档会话'),
    createElement('div', { style: { fontSize: 12, color: tk.tertiary } },
      '官方「归档」隐藏会话（日志保留）；这里可恢复或彻底删除。操作后需重启 dsh 生效。'),
    createElement('div', { style: { ...cardS, padding: 12, display: 'flex', gap: 10, alignItems: 'center' } },
      createElement('div', { style: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.5, color: tk.secondary } },
        rows.length > 0 ? `共 ${rows.length} 个归档会话` : '暂无归档会话'),
      createElement('button', {
        style: { ...ghostBtn, cursor: busy === '*all*' ? 'wait' : 'pointer', color: tk.danger, borderColor: tk.danger },
        onClick: deleteAll,
        disabled: busy !== null || rows.length === 0,
      }, busy === '*all*' ? '删除中…' : '删除所有归档会话'),
    ),
    rows.length === 0 && !err
      ? createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '加载中…')
      : null,
    rows.map((it) =>
      createElement('div', { key: it.sessionId, style: { ...cardS, padding: 12, display: 'flex', gap: 12, alignItems: 'center' } },
        createElement('div', { style: { flex: 1, minWidth: 0 } },
          createElement('div', { style: { fontFamily: 'monospace', fontSize: 12, color: tk.text, lineHeight: 1.4, wordBreak: 'break-all' } }, it.sessionId),
          createElement('div', { style: { fontSize: 12, color: tk.tertiary, marginTop: 3 } },
            `${it.workspaceTitle ? it.workspaceTitle + ' · ' : ''}${it.workspacePath ?? '未关联工作区'} · ${fmtTime(it.mtimeMs)}`),
          createElement('div', { style: { fontSize: 11, color: it.onDisk ? tk.tertiary : tk.danger, marginTop: 2 } },
            it.onDisk ? '日志在磁盘' : '日志已缺失'),
        ),
        createElement('div', { style: { display: 'flex', gap: 8 } },
          createElement('button', {
            style: { ...ghostBtn, cursor: busy === it.sessionId ? 'wait' : 'pointer' },
            onClick: () => act(it.sessionId, 'restore', '恢复'),
            disabled: busy !== null,
          }, busy === it.sessionId ? '…' : '恢复'),
          createElement('button', {
            style: { ...ghostBtn, cursor: busy === it.sessionId ? 'wait' : 'pointer', color: tk.danger, borderColor: tk.danger },
            onClick: () => act(it.sessionId, 'delete', '删除'),
            disabled: busy !== null,
          }, busy === it.sessionId ? '…' : '删除'),
        ),
      ),
    ),
    note ? createElement('div', { style: { color: tk.success, fontSize: 13 } }, note) : null,
    err ? createElement('div', { style: { color: tk.danger, fontSize: 13 } }, err) : null,
  )
}

/**
 * 权限预设名双语化。
 *
 * 官方 dsh 把权限预设名（read only / workspace-write / Full access 等）由 host
 * schema 硬编码、经 displayPermissionPreset() 直接显示，不随 UI 语言本地化——
 * 英文界面是原名，中文界面也仍是英文。这里在中文界面下用 DOM 精确文本替换，
 * 把下拉里**恰好**为一个权限名的文本节点换成中文。只替换精确相等的整段文本，
 * 不触碰句子中嵌入的英文（如确认弹窗里的 "启用 Full access？"）。
 */
/**
 * 权限预设名双语化（跟随界面语言切换）。
 *
 * 官方 dsh 把权限预设名（read only / workspace-write / Full access 等）由 host
 * schema 硬编码、经 displayPermissionPreset() 直接显示，不随 UI 语言本地化。
 * 这里订阅 dsh 的 locale 服务：中文界面把「恰好等于权限名」的文本节点替换成
 * 中文；切回英文（或卸载插件）时恢复原英文。用 WeakMap 记录被改节点的原始
 * 文本保证可逆；只处理精确匹配的整段文本，不误伤句子内嵌英文。
 */
function installPermissionNamesLocalizer(locale: {
  getLocale: () => { active: string }
  subscribe: (fn: () => void) => () => void
}): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}

  // 英文展示名 -> 中文
  const enToZh: Record<string, string> = {
    'Read Only': '只读',
    'Read only': '只读',
    'read only': '只读',
    'Workspace Write': '工作区写入',
    'Workspace write': '工作区写入',
    'workspace-write': '工作区写入',
    'Workspace Write (ask)': '工作区写入（询问）',
    'Full access': '完全访问',
    'Full Access': '完全访问',
    'full access': '完全访问',
    'Danger full access': '完全访问',
  }
  // 中文 -> 英文（反向，取首个原形，用于无 WeakMap 记录时的恢复兜底）
  const zhToEn: Record<string, string> = {}
  for (const en of Object.keys(enToZh)) {
    const zh = enToZh[en]
    if (!(zh in zhToEn)) zhToEn[zh] = en
  }

  // 记录「被我们改成中文」的文本节点的原始英文（含空白）
  const rawOriginals = new WeakMap<Text, string>()

  const isZh = (): boolean => locale.getLocale().active.toLowerCase().startsWith('zh')

  const applyNode = (text: Text): void => {
    const v = String(text.nodeValue ?? '')
    if (v === '') return
    const trim = v.trim()

    if (isZh()) {
      // 中文模式：英文名 -> 中文
      const zh = Object.prototype.hasOwnProperty.call(enToZh, v) ? enToZh[v]
        : (Object.prototype.hasOwnProperty.call(enToZh, trim) ? enToZh[trim] : undefined)
      if (zh === undefined) return // 不是权限名（或已是中文），不动
      if (!rawOriginals.has(text)) rawOriginals.set(text, v)
      const next = v.replace(trim, zh)
      if (text.nodeValue !== next) text.nodeValue = next
    } else {
      // 英文模式：中文 -> 英文
      const en = Object.prototype.hasOwnProperty.call(zhToEn, v) ? zhToEn[v]
        : (Object.prototype.hasOwnProperty.call(zhToEn, trim) ? zhToEn[trim] : undefined)
      if (en === undefined) {
        // 已是英文权限名 → 清掉残留记录（若存在）
        rawOriginals.delete(text)
        return
      }
      // 优先用原始记录（保留原始大小写/空白），否则反向表
      const orig = rawOriginals.get(text)
      const target = orig !== undefined && orig.trim() !== '' ? orig : v.replace(trim, en)
      rawOriginals.delete(text)
      if (text.nodeValue !== target) text.nodeValue = target
    }
  }

  const walk = (root: Node): void => {
    if (root.nodeType === Node.TEXT_NODE) { applyNode(root as Text); return }
    const iter = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = iter.nextNode()) !== null) applyNode(node as Text)
  }

  let mo: MutationObserver | null = null
  const ensureBody = (): void => {
    if (!document.body) { setTimeout(ensureBody, 50); return }
    refresh()
    mo = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== 'childList') continue
        for (const added of record.addedNodes) walk(added)
        if (record.target.nodeType === Node.TEXT_NODE) applyNode(record.target as Text)
        else walk(record.target)
      }
    })
    mo.observe(document.body, { childList: true, subtree: true })
  }

  const refresh = (): void => {
    if (!document.body) return
    // 全量扫一遍：按当前语言把整棵文档校正（既能中文化新的，也能在切英文时还原）
    walk(document.body)
  }

  // 订阅语言切换：变化时全量校正（这也是「切英文能恢复」的关键）
  const unsub = locale.subscribe(() => refresh())
  ensureBody()

  return () => {
    unsub()
    if (mo) mo.disconnect()
    // 卸载时恢复英文
    if (document.body) walk(document.body)
  }
}

/** 桌面 preload 注入的 dsh 运行时桥（__dshDesktop.runtime）。 */
declare global {
  interface Window {
    __dshDesktop?: {
      runtime?: {
        getVersion: () => Promise<{ current: string | null; feedLatest: string | null; feedUrl: string }>
        checkUpdate: () => Promise<{ started: boolean }>
      }
    }
  }
}

/** 设置页「dsh 版本」面板：显示当前 runtime 版本 + feed 最新 + 检查/更新按钮。
 *  仅桌面端（有 __dshDesktop.runtime）显示；纯浏览器隐藏。 */
function VersionPanel(): unknown {
  const [info, setInfo] = useState<{ current: string | null; feedLatest: string | null; feedUrl: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')

  const hasRuntime = !!(window as Window & { __dshDesktop?: { runtime?: unknown } }).__dshDesktop?.runtime
  const reload = () => {
    const rt = (window as Window & { __dshDesktop?: { runtime?: { getVersion: () => Promise<typeof info> } } }).__dshDesktop?.runtime
    if (rt) void rt.getVersion().then(setInfo)
  }
  useEffect(() => { reload() }, [])
  if (!hasRuntime) return null

  const updatable = info !== null && info.current !== null && info.feedLatest !== null && info.current !== info.feedLatest
  const doCheck = async () => {
    const rt = (window as Window & { __dshDesktop?: { runtime?: { checkUpdate: () => Promise<unknown> } } }).__dshDesktop?.runtime
    if (!rt) return
    setBusy(true); setMsg('开始更新…（下载→校验→应用→重启，日志见桌面日志）')
    try { await rt.checkUpdate(); setMsg('已触发更新，请稍候观察版本变化。') }
    catch (e) { setMsg(String((e && (e as Error).message) || e)) }
    finally { setBusy(false); setTimeout(reload, 5000) }
  }

  return createElement('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520, color: tk.text } },
    createElement('div', { style: { fontSize: 15, fontWeight: 600 } }, 'dsh 版本'),
    createElement('div', { style: { ...cardS, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 } },
      createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
        createElement('span', { style: { color: tk.secondary } }, '当前版本'),
        createElement('span', { style: { fontWeight: 600 } }, info?.current ?? '读取中…')),
      createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
        createElement('span', { style: { color: tk.secondary } }, '最新版本'),
        createElement('span', { fontWeight: 600 as const, color: updatable ? tk.success : 'inherit' }, info?.feedLatest ?? '未知')),
      createElement('div', { style: { fontSize: 11, color: tk.tertiary, wordBreak: 'break-all' } },
        info?.feedUrl ?? ''),
      updatable
        ? createElement('div', { style: { fontSize: 12, color: tk.success } }, '发现新版本，可更新。')
        : createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '已是最新或暂无更新源。'),
      msg ? createElement('div', { style: { fontSize: 12, color: tk.secondary } }, msg) : null,
      createElement('button', { style: { ...(updatable ? primaryBtn : ghostBtn), alignSelf: 'flex-start' }, disabled: busy, onClick: doCheck },
        updatable ? (busy ? '更新中…' : '检查并更新 dsh') : (busy ? '检查中…' : '重新检查')),
    ),
  )
}

/** Registration through the slot system; the shell provides the `settings.section` hole. */
export function apply(ctx: {
  get(name: string): unknown
  // locale 服务由 inject 提供（dsh-client-locale），用于跟随语言切换
  locale?: { getLocale: () => { active: string }; subscribe: (fn: () => void) => () => void }
  effect?: (fn: () => unknown, label: string) => void
}): void {
  // 权限预设名双语化：订阅 locale，中文显示中文、切英文/卸载恢复原英文。
  if (ctx.locale) {
    const stopLocalizer = installPermissionNamesLocalizer(ctx.locale)
    ctx.effect?.(() => stopLocalizer, 'dsh-kit: permission names localizer')
  }

  const slots = ctx.get('slots') as { inject(name: string, fn: () => unknown): unknown; register(...a: unknown[]): unknown } | undefined
  if (slots === undefined) return
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'dsh-kit-store', priority: 40, label: () => '功能商店' }, () => createElement(StorePanel, null)),
  )
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'dsh-kit-archive', priority: 41, label: () => '归档会话' }, () => createElement(ArchivePanel, null)),
  )
  // dsh 版本：仅桌面端显示（浏览器隐藏），检查/更新内置 dsh-runtime。
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'dsh-kit-version', priority: 42, label: () => 'dsh 版本' }, () => createElement(VersionPanel, null)),
  )
}
