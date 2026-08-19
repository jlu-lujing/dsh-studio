/**
 * dsh-studio client —— 单包方案下的统一 client 入口。
 *
 * 六个功能子模块的 client 全部并入这一个 `.client` bundle。由于 cordis
 * 只加载一个 `dsh-studio` 行，这里在 client 侧同样按同一份 host state
 * （GET /dsh-studio/store）做功能级门控：只有对应功能启用时，才注册它的
 * UI/槽位/服务；停用则该 UI 不挂载（和 host 侧"不挂载"一致）。
 *
 * 门控实现：
 *  - 首次 apply 先拉一次 state，立即安装已启用功能的 UI；
 *  - 之后轮询 state（每 5s），有启用/停用变化时重建 feature 注册
 *    （卸载旧的、只重挂当前已启用的）。store/archive/version 面板是聚合
 *    自有的管理面，始终注册。
 */
import { createElement, useEffect, useState } from 'react'

export const name = 'dsh-studio'
// 并集声明：dsh-studio 聚合面板用 connection/locale；功能子模块还依赖
// theme/slots/workspaces/layout。cordis 注入后这些在 ctx.get() 里都可用。
export const inject = ['connection', 'locale', 'theme', 'slots', 'workspaces', 'layout']

/* ── 核心：state 驱动的功能注册器 ───────────────────────────────────── */

type FeatureState = Record<string, boolean>

let featureStateCache: FeatureState | null = null
let disposers: Array<() => void> = []

function fetchFeatureState(): Promise<FeatureState> {
  return fetch('/dsh-studio/store')
    .then((r) => r.json())
    .then((d) => {
      const list = (d as { features?: Array<{ id: string; enabled: boolean }> }).features ?? []
      const state: FeatureState = {}
      for (const f of list) state[f.id] = f.enabled
      featureStateCache = state
      return state
    })
}

function isEnabled(id: string): boolean {
  if (featureStateCache && id in featureStateCache) return featureStateCache[id]
  // 默认：除 lan-auth（默认关）外都开。
  return id !== 'dsh-studio-lan-auth'
}

import { apply as applyWebuiClient } from '../webui/client/index.ts'
import { apply as applyWorktreeClient } from '../worktree/client/index.ts'
import { apply as applyLanAuthClient } from '../lan-auth/client/index.ts'
import { apply as applyInputHistoryClient } from '../input-history/client/index.ts'

/* 功能级 client 挂载策略：statatic import 全部进同一个 bundle（不产生额外
 * chunk，避免官方 client module loader 无法解析相对 chunk），启用才调用其
 * apply()。禁用则不调用 → 对应槽位/服务不注册。 */
const FEATURE_ARMS: Array<{ id: string; apply: (ctx: { get(name: string): unknown }) => void }> = [
  { id: 'dsh-studio-webui', apply: applyWebuiClient },
  { id: 'dsh-studio-worktree', apply: applyWorktreeClient },
  { id: 'dsh-studio-lan-auth', apply: applyLanAuthClient },
  { id: 'dsh-studio-input-history', apply: applyInputHistoryClient },
]

function teardownFeatureUIs(): void {
  for (const stop of disposers) { try { stop() } catch { /* ignore */ } }
  disposers = []
}

function syncFeatureUIs(ctx: unknown): void {
  teardownFeatureUIs()
  for (const arm of FEATURE_ARMS) {
    if (!isEnabled(arm.id)) continue
    try {
      const stop = arm.apply(ctx as { get(name: string): unknown }) as (() => void) | undefined
      if (typeof stop === 'function') disposers.push(stop)
    } catch (e) {
      console.warn(`[dsh-studio] failed to mount client feature ${arm.id}:`, e)
    }
  }
}

function startStateWatcher(ctx: unknown, initialKey: string): () => void {
  let running = true
  let prev = initialKey
  const tick = async () => {
    if (!running) return
    try {
      const state = await fetchFeatureState()
      const key = JSON.stringify(Object.entries(state).sort())
      if (key !== prev) { prev = key; syncFeatureUIs(ctx) }
    } catch { /* 本机状态端点暂时不可达——稍后重试 */ }
  }
  const timer = setInterval(() => void tick(), 5000)
  return () => { running = false; clearInterval(timer) }
}

/* ── 聚合面板（store / archive / version）始终注册 ──────────────────── */

interface Feature {
  id: string
  name: string
  description: string
  enabled: boolean
  installable: boolean
  togglable: boolean
  installed: boolean
}

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
    fetch('/dsh-studio/store')
      .then((r) => r.json())
      .then((d) => { setFeatures((d as { features: Feature[] }).features); setErr('') })
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

function StorePanel() {
  const { features, err, setErr, refresh } = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [installMsg, setInstallMsg] = useState<string | null>(null)
  const rows = features ?? []

  const toggle = (f: Feature) => {
    setErr(''); setBusy(f.id)
    api(`/dsh-studio/store/${f.id}`, { enabled: !f.enabled })
      .then(refresh)
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setBusy(null))
  }

  const installArtifact = (f: Feature) => {
    setErr(''); setBusy(f.id)
    api(`/dsh-studio/store/${f.id}/install`, {})
      .then(refresh)
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setBusy(null))
  }

  const deleteArtifact = (f: Feature) => {
    if (!window.confirm(`确定删除 ${f.name} 的已安装文件（~/.dsh/.agent-presets/boost-mode）？`)) return
    setErr(''); setBusy(f.id)
    api(`/dsh-studio/store/${f.id}/delete`, {})
      .then(refresh)
      .catch((e) => setErr(String((e && e.message) || e)))
      .finally(() => setBusy(null))
  }

  const installAll = () => {
    setErr(''); setInstallMsg(null)
    api('/dsh-studio/store/install', {})
      .then((r) => setInstallMsg(`已安装到 ${(r as { profile?: string }).profile ?? '当前'} 环境，重启后全部功能生效。`))
      .catch((e) => setInstallMsg(`安装失败：${String((e && e.message) || e)}`))
      .finally(() => setBusy(null))
  }

  return createElement('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760, color: tk.text } },
    createElement('div', { style: { fontSize: 15, fontWeight: 600 } }, 'dsh-studio 功能商店'),
    createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '启停功能，重启后保留；停用的功能其界面与路由一并隐藏。'),
    createElement('div', { style: { ...cardS, padding: 12, display: 'flex', gap: 10, alignItems: 'center' } },
      createElement('div', { style: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.5, color: tk.secondary } },
        installMsg ?? '一键将全家桶安装到当前环境，装完即可开箱即用。'),
      createElement('button', {
        style: { ...primaryBtn, cursor: busy !== null ? 'wait' : 'pointer' },
        onClick: installAll, disabled: busy !== null,
      }, '一键安装'),
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
                onClick: () => toggle(f), disabled: busy !== null,
              }, busy === f.id ? '…' : (f.enabled ? '停用' : '启用'))
            : null,
          f.installable
            ? createElement('button', {
                style: { ...ghostBtn, cursor: busy === f.id ? 'wait' : 'pointer' },
                onClick: () => f.installed ? deleteArtifact(f) : installArtifact(f), disabled: busy !== null,
              }, busy === f.id ? '…' : (f.installed ? '删除' : '安装'))
            : null,
        ),
      ),
    ),
    err ? createElement('div', { style: { color: tk.danger, fontSize: 13 } }, err) : null,
  )
}

/* ── 归档会话面板（聚合自有，始终注册） ─────────────────────────────── */

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

function ArchivePanel() {
  const [items, setItems] = useState<ArchivedItem[] | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = () => {
    fetch('/dsh-studio/archive/sessions')
      .then((r) => r.json())
      .then((d) => setItems(((d as { items?: ArchivedItem[] }).items) ?? []))
      .catch((e) => setErr(String((e && e.message) || e)))
  }
  useEffect(refresh, [])
  const act = (id: string, action: 'restore' | 'delete', label: string) => {
    if (action === 'delete' && !window.confirm(`确定删除归档会话 ${id} 吗？该操作会删除 ~/.dsh/sessions 下的对应日志，不可恢复。`)) return
    setErr(''); setNote(''); setBusy(id)
    api(`/dsh-studio/archive/${id}/${action}`, {})
      .then(() => { setNote(`${label}成功，重启 dsh 后列表与侧边栏生效。`); refresh() })
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
        onClick: () => {
          if (!window.confirm('确定删除【全部】归档会话吗？这会永久删除所有归档会话的日志文件（~/.dsh/sessions 下），不可恢复。')) return
          setErr(''); setNote(''); setBusy('*all*')
          api('/dsh-studio/archive/delete-all', {})
            .then((r) => { setNote(`已删除全部 ${(r as { deleted?: number }).deleted ?? 0} 个归档会话，重启 dsh 后侧边栏同步。`); refresh() })
            .catch((e) => setErr(String((e && e.message) || e)))
            .finally(() => setBusy(null))
        },
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
            onClick: () => act(it.sessionId, 'restore', '恢复'), disabled: busy !== null,
          }, busy === it.sessionId ? '…' : '恢复'),
          createElement('button', {
            style: { ...ghostBtn, cursor: busy === it.sessionId ? 'wait' : 'pointer', color: tk.danger, borderColor: tk.danger },
            onClick: () => act(it.sessionId, 'delete', '删除'), disabled: busy !== null,
          }, busy === it.sessionId ? '…' : '删除'),
        ),
      ),
    ),
    note ? createElement('div', { style: { color: tk.success, fontSize: 13 } }, note) : null,
    err ? createElement('div', { style: { color: tk.danger, fontSize: 13 } }, err) : null,
  )
}

/* ── dsh 版本面板（桌面仅显示，始终注册） ────────────────────────────── */

interface VersionInfo { current: string | null; feedLatest: string | null; feedUrl: string }

function VersionPanel(): unknown {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const hasRuntime = !!(window as Window & { __dshDesktop?: { runtime?: unknown } }).__dshDesktop?.runtime
  const reload = () => {
    const rt = (window as Window & { __dshDesktop?: { runtime?: { getVersion: () => Promise<VersionInfo> } } }).__dshDesktop?.runtime
    if (rt) void rt.getVersion().then(setInfo)
  }
  useEffect(() => { reload() }, [])
  if (!hasRuntime) return null
  const updatable = info !== null && info.current !== null && info.feedLatest !== null && info.current !== info.feedLatest
  const doCheck = () => {
    const rt = (window as Window & { __dshDesktop?: { runtime?: { checkUpdate: () => Promise<unknown> } } }).__dshDesktop?.runtime
    if (!rt) return
    setBusy(true); setMsg('开始更新…（下载→校验→应用→重启，日志见桌面日志）')
    rt.checkUpdate()
      .then(() => setMsg('已触发更新，请稍候观察版本变化。'))
      .catch((e) => setMsg(String(e instanceof Error ? e.message : e)))
      .finally(() => { setBusy(false); setTimeout(reload, 5000) })
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
      createElement('div', { style: { fontSize: 11, color: tk.tertiary, wordBreak: 'break-all' } }, info?.feedUrl ?? ''),
      updatable ? createElement('div', { style: { fontSize: 12, color: tk.success } }, '发现新版本，可更新。')
        : createElement('div', { style: { fontSize: 12, color: tk.tertiary } }, '已是最新或暂无更新源。'),
      msg ? createElement('div', { style: { fontSize: 12, color: tk.secondary } }, msg) : null,
      createElement('button', { style: { ...(updatable ? primaryBtn : ghostBtn), alignSelf: 'flex-start' }, disabled: busy, onClick: doCheck },
        updatable ? (busy ? '更新中…' : '检查并更新 dsh') : (busy ? '检查中…' : '重新检查')),
    ),
  )
}

/* ── 注册：聚合面板 + 门控后的 feature UI ────────────────────────────── */

export function apply(ctx: { get(name: string): unknown }): void {
  const slots = ctx.get('slots') as
    { inject(name: string, fn: () => unknown): unknown; register(...a: unknown[]): unknown } | undefined
  if (slots === undefined) return

  // 聚合自有面板：始终注册。
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'dsh-studio-store', priority: 40, label: () => '功能商店' }, () => createElement(StorePanel, null)),
  )
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'dsh-studio-archive', priority: 41, label: () => '归档会话' }, () => createElement(ArchivePanel, null)),
  )
  slots.inject('settings.section', () =>
    slots.register({ name: 'settings.section', id: 'dsh-studio-version', priority: 42, label: () => 'dsh 版本' }, () => createElement(VersionPanel, null)),
  )

  // feature UI：先异步取一次 state → 首次挂载，再让 watcher 从这个 state
  // 起跟随变化。这样首帧不重复注册（slot 不会冲突），切启停也只重建一次。
  let initialKey = ''
  const boot = async () => {
    try {
      const state = await fetchFeatureState()
      initialKey = JSON.stringify(Object.entries(state).sort())
    } catch { /* 端点暂不可达：按默认状态挂载 */ }
    syncFeatureUIs(ctx)
    const stopWatcher = startStateWatcher(ctx, initialKey)
    // 通过 ctx.effect 注册卸载回调（若宿主提供）；否则挂到 unload。
    const eff = (ctx as { effect?: (fn: () => unknown, label?: string) => void }).effect
    if (typeof eff === 'function') {
      eff(() => { stopWatcher(); teardownFeatureUIs() }, 'dsh-studio: client feature gate')
    } else {
      window.addEventListener('beforeunload', () => { stopWatcher(); teardownFeatureUIs() })
    }
  }
  void boot()
}
