/** 主题商店生命周期控制器。
 *
 * 关键生命周期：主题注册 / 全局叠加层必须存活在**插件 apply 作用域**，
 * 而不是设置页面组件里——设置页关闭时组件会卸载，若在组件里做 cleanup
 * 会把正在使用的主题注销掉。因此 index.ts 在 apply() 时创建一个
 * ThemeStoreController（整个插件生命周期存活），面板只订阅并调用它。
 */
import {
  BUILTIN_THEMES, OFFICIAL_THEMES, loadStored, saveStored,
  type ThemeService, type TokenModes, type WebUITheme,
} from './themes.ts'

const GLOBAL_SOURCE = 'dsh-kit-webui.global'
/** 当前选中「预设/自定义」主题的 override 层 source（不改官方 preference）。 */
const ACTIVE_SOURCE = 'dsh-kit-webui.active'


/** 官方可持久化的主题 id（跟随系统 / 深色 / 浅色）。 */
const OFFICIAL_IDS = new Set(OFFICIAL_THEMES.map((t) => t.id))
/** 是否为官方内置主题（id ∈ system/dark/light）。 */
function isOfficialId(id: string): boolean {
  return OFFICIAL_IDS.has(id)
}

/** 单值 token 表 → override 层用的双模式表（light/dark 同值，随官方基底取色）��� */
function tokensToModes(tokens: Record<string, string>): Record<string, TokenModes> {
  const out: Record<string, TokenModes> = {}
  for (const [k, v] of Object.entries(tokens)) out[k] = { light: v, dark: v }
  return out
}

function mergeThemes(custom: WebUITheme[], fromHost: WebUITheme[]): WebUITheme[] {
  // 起步 = 官方主题 + 内置预设
  const out: WebUITheme[] = [
    ...OFFICIAL_THEMES.map((t) => ({ ...t, tokens: { ...t.tokens } })),
    ...BUILTIN_THEMES.map((t) => ({ ...t, tokens: { ...t.tokens } })),
  ]
  const seen = new Set(out.map((t) => t.id))
  for (const t of [...fromHost, ...custom]) {
    if (!t || typeof t.id !== 'string' || seen.has(t.id)) continue
    seen.add(t.id)
    out.push({ ...t, tokens: { ...t.tokens } })
  }
  return out
}

async function fetchHostThemes(): Promise<{
  themes: WebUITheme[]
  active: string | null
  global: Record<string, TokenModes>
}> {
  try {
    const res = await fetch('/dsh-kit-webui/themes')
    if (!res.ok) return { themes: [], active: null, global: {} }
    const data = (await res.json()) as {
      themes?: WebUITheme[]
      active?: string | null
      global?: Record<string, TokenModes>
    }
    return {
      themes: Array.isArray(data.themes) ? data.themes : [],
      active: data.active ?? null,
      global: data.global ?? {},
    }
  } catch {
    return { themes: [], active: null, global: {} }
  }
}

function postHostTheme(theme: WebUITheme): void {
  try {
    fetch('/dsh-kit-webui/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    }).catch(() => undefined)
  } catch { /* 离线忽略 */ }
}

function postHostDelete(id: string): void {
  try {
    fetch('/dsh-kit-webui/themes/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => undefined)
  } catch { /* 离线忽略 */ }
}

function postHostState(state: { active?: string | null; global?: Record<string, TokenModes> }): void {
  try {
    fetch('/dsh-kit-webui/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => undefined)
  } catch { /* 离线忽略 */ }
}

/** 插件生命周期级控制器：主题注册/切换、全局叠加层、持久化。 */
export class ThemeStoreController {
  themes: WebUITheme[] = []
  activeId: string | null = null
  globalTokens: Record<string, TokenModes> = {}
  ready = false

  private readonly disposers: Array<() => void> = []
  private globalDisposer: (() => void) | undefined
  /** 当前选中预设/自定义主题的 override 层 disposer（官方主题无此层）。 */
  private activeDisposer: (() => void) | undefined
  private readonly listeners = new Set<() => void>()

  constructor(private readonly theme?: ThemeService) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try { fn() } catch { /* no-op */ }
    }
  }

  private registerAll(): void {
    if (!this.theme) return
    for (const d of this.disposers.splice(0)) {
      try { d() } catch { /* no-op */ }
    }
    // 只注册「非官方」主题：官方 system/dark/light 已由官方 ui-theme 注册，
    // 重复 register 会抛 duplicate/“system not registrable”，跳过即可。
    // 注：注册预设只是为了 registry 有该 id；真正呈现通过 override 层
    // （applyActiveTheme），不改变官方 preference（避免 adopt 覆盖回官方）。
    for (const t of this.themes) {
      if (isOfficialId(t.id)) continue
      try {
        this.disposers.push(this.theme.register({
          id: t.id,
          colorScheme: t.colorScheme,
          tokens: { ...t.tokens },
        }))
      } catch { /* duplicate/invalid: skip */ }
    }
  }

  /**
   * 应用当前选中的主题（init/applyTheme 共用权威入口）。
   *
   * 为什么不能直接用 setTheme(预设id)：官方 preference 只认 system/light/dark，
   * setTheme(预设id) 只改内存 active，官方 settings 仍 system → 任何 adopt()
   * /settings sync 都会把它重置回 system(→dark)，导致启动回官方深色。
   *
   * 策略：
   *   - 官方主题（system/dark/light）→ setTheme(id)（官方处理 preference，稳定）
   *   - 预设/自定义 → 先 setTheme(对应官方基底 dark/light)（preference 保持官方
   *     认可值，稳定），再把该主题整表 token 作为 override 层（ACTIVE_SOURCE）
   *     应用 → 视觉是本主题，底层 preference 稳定不被覆盖。
   */
  private applyActiveTheme(id: string | null): void {
    if (!this.theme) return
    this.activeId = id
    const theme = id === null ? undefined : this.themes.find((t) => t.id === id)

    // 清掉旧的 active override 层
    try { this.activeDisposer?.() } catch { /* ignore */ }
    this.activeDisposer = undefined

    if (theme === undefined || isOfficialId(id ?? '')) {
      // 官方主题或空：交给官方 setTheme（system/light/dark），无 override 层。
      if (id !== null) {
        try { this.theme.setTheme(id) } catch { /* ignore */ }
      }
      return
    }

    // 预设/自定义：落到官方基底 + override 层
    try {
      this.theme.setTheme(theme.colorScheme) // 'light' | 'dark' 官方基底
    } catch { /* ignore */ }
    try {
      this.activeDisposer = this.theme.overrideTokens(ACTIVE_SOURCE, tokensToModes(theme.tokens))
    } catch { /* ignore */ }
  }


  private persistCustom(): void {
    const stored = loadStored()
    saveStored({ ...stored, custom: this.themes.filter((t) => !t.builtin) })
  }

  /** 启动：恢复本地/远端主题，注册全部主题，应用全局层，恢复 active。 */
  async init(): Promise<void> {
    const stored = loadStored()
    const host = await fetchHostThemes()

    // 选中主题 / 全局层以上收 host 为准（桌面与 LAN 浏览器共享同一份），
    // 本地 localStorage 只兜底首次离线 / 尚未迁移的旧值。
    this.globalTokens = host.global && Object.keys(host.global).length > 0 ? host.global : stored.global
    this.applyGlobalLayer(this.globalTokens)

    this.themes = mergeThemes(stored.custom, host.themes)
    // 官方三个主题（system/dark/light）在列表里但由官方注册，注册阶段只注册
    // 非官方主题；随后按权威 active 恢复。
    this.registerAll()

    // 当前 selector 权威顺序：host.active（跨 origin 持久）> stored.active
    // （localStorage 兜底）> 官方 preference（首次 / 都没记录时，跟随官方）。
    const officialPref = this.theme?.getTheme()?.preference ?? null
    const active = host.active ?? stored.active ?? officialPref ?? null

    if (active === null) {
      // 完全无记录：跟随官方当前 preference（可能是 system/light/dark）
      this.activeId = null
    } else if (this.themes.some((t) => t.id === active)) {
      this.applyActiveTheme(active)
      // host 未记录时回写（迁移：把旧 localStorage 或官方 preference 上收到 host，
      // 让桌面与浏览器共享同一份）
      if (host.active !== active) postHostState({ active })
    } else {
      // active 不在我们列表里（如官方 preference=system 而 host 没记录）：
      // 跟随官方当前解析结果，但只作为展示，不强制改用户选择。
      const resolved = this.theme?.getTheme()?.active?.id
      this.activeId = resolved && isOfficialId(resolved) ? resolved : null
    }
    this.ready = true
    this.emit()
  }

  /** 全局界面调整：与主题无关，叠加在任意主题之上。 */
  setGlobal(next: Record<string, TokenModes>): void {
    this.applyGlobalLayer(next)
    const stored = loadStored()
    saveStored({ ...stored, global: next })
    postHostState({ global: next })
    this.emit()
  }

  private applyGlobalLayer(next: Record<string, TokenModes>): void {
    this.globalTokens = next
    if (!this.theme) return
    try {
      this.globalDisposer?.()
      this.globalDisposer = this.theme.overrideTokens(GLOBAL_SOURCE, next)
    } catch { /* ui-theme 不存在时面板只读 */ }
  }

  applyTheme(id: string): void {
    this.applyActiveTheme(id)
    const stored = loadStored()
    saveStored({ ...stored, active: id })
    postHostState({ active: id })
    this.emit()
  }

  /** 新建/覆盖一个自定义主题。返回 false 表示 id 与内置预设冲突。 */
  saveCustom(t: WebUITheme): boolean {
    if (BUILTIN_THEMES.some((x) => x.id === t.id)) return false
    const rest = this.themes.filter((x) => !x.builtin && x.id !== t.id)
    this.themes = mergeThemes(rest, [t])
    this.registerAll()
    postHostTheme(t)
    this.persistCustom()
    this.emit()
    return true
  }

  deleteCustom(id: string): void {
    const existed = this.themes.some((t) => t.id === id && !t.builtin)
    if (!existed) return
    this.themes = this.themes.filter((t) => t.id !== id)
    this.registerAll()
    postHostDelete(id)
    if (this.activeId === id) {
      this.applyActiveTheme('dark')
    }
    this.persistCustom()
    const stored = loadStored()
    saveStored({ ...stored, active: null })
    postHostState({ active: null })
    this.emit()
  }

  /** 插件卸载时清掉注册与全局层（apply 作用域 dispose）。 */
  dispose(): void {
    for (const d of this.disposers.splice(0)) {
      try { d() } catch { /* no-op */ }
    }
    try { this.globalDisposer?.() } catch { /* no-op */ }
    this.globalDisposer = undefined
    try { this.activeDisposer?.() } catch { /* no-op */ }
    this.activeDisposer = undefined
    this.listeners.clear()
  }
}
