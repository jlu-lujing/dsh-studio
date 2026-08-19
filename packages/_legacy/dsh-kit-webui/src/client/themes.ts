/**
 * dsh-kit-webui 主题商店 —— 数据层。
 *
 * 分层（严格对齐官方 `@deepseek-ai/dsh-client-ui-theme` 的 API）：
 *
 * 1. 全局界面调整（GlobalLayer）
 *    - 官方 `ctx.theme.overrideTokens(source, tokens)`：tokens 是 `--dsw-alias-*`
 *      → { light, dark } 双值，作为**叠加层**叠在当前激活主题之上。
 *    - 效果：无论用户切到哪个主题（官方 light/dark/system 或本店任意主题），
 *      全局调整始终生效，并且自动跟随浅色/深色模式取对应值。
 *
 * 2. 各主题自己的风格（ThemeDefinition）
 *    - 官方 `ctx.theme.register({ id, colorScheme, tokens })`：tokens 是
 *      `--dsw-alias-*` → 单个 CSS 字符串（不是 {light,dark}，见官方
 *      ThemeDefinition.tokens 类型 ThemeTokens = Record<string,string>）。
 *    - 每个主题通过 `colorScheme: 'light' | 'dark'` 声明自己的基础模式；
 *      为了让同一风格适配深浅色，预设按「家族」提供 dark/light 两个变体。
 *    - `ctx.theme.setTheme(id)` 切换；官方 README 明确三方面板 id 是
 *      in-process 扩展，不写进内置 settings schema → 由本插件自行持久化。
 *
 * 持久化：localStorage（一机一份）；host 侧另有 `/dsh-kit-webui/themes`
 * JSON 落盘（跨浏览器续传）。
 */

/** 全局叠加层的单 token 双模式值（官方 overrideTokens 要求的形状）。 */
export interface TokenModes { light: string; dark: string }

export function pair(light: string, dark: string): TokenModes {
  return { light, dark }
}

/** 官方 ui-theme ThemeRuntime 的本插件子集（全局层 + 主题注册/切换）。 */
export interface ThemeService {
  register(theme: { id: string; colorScheme: 'light' | 'dark'; tokens: Record<string, string> }): () => void
  setTheme(id: string): void
  getTheme(): { preference: string; active: { id: string } }
  overrideTokens(source: string, tokens: Record<string, TokenModes>): () => void
}

/** 一个主题（官方 ThemeDefinition 同构：tokens 是单值，模式由 colorScheme 决定）。 */
export interface WebUITheme {
  id: string
  name: string
  description: string
  colorScheme: 'light' | 'dark'
  builtin: boolean
  /**
   * 主题种类：official = 官方内置（无 token，直接用官方 base palette）；
   * preset = 我们的内置预设；custom = 用户自定义。
   */
  kind?: 'official' | 'preset' | 'custom'
  /** --dsw-alias-* → CSS 值（该主题自己的风格；official 主题为空，用官方默认）。 */
  tokens: Record<string, string>
}

/** 可定制的语义 token 字段。
 *
 * 字段目录从官方 design-platform.css 实际消费的 CSS 变量中挑选，
 * 按「窗口 / 按钮与输入 / Markdown 与代码 / 状态」四组编排：
 *  - 窗口与基础：应用外壳（背景层级、边框、文字、侧边栏、滚动条）
 *  - 按钮与输入：按钮体系、输入框、交互态
 *  - Markdown 与代码：消息气泡、引用标注、代码块、语法高亮
 *  - 状态：错误 / 成功 / 警告 / 业务强调
 *
 * ThemePresenter 会把任意 token 写为 body 内联 CSS 变量，因此除
 * 官方 inspect 目录里的 alias token 外，--dsw-specific-* 与 --shiki-*
 * 同样可被主题覆盖（shiki 色板见官方 styles/shiki.css）。
 */
export interface TokenField {
  name: string
  label: string
}

export type TokenGroupId = 'window' | 'controls' | 'markdown' | 'status'

export interface TokenGroup {
  id: TokenGroupId
  label: string
  description: string
  fields: TokenField[]
}

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: 'window',
    label: '窗口与基础',
    description: '应用外壳：背景层级、边框、文字、侧边栏与滚动条。可独立于内容区设置。',
    fields: [
      { name: '--dsw-alias-bg-base', label: '窗口背景' },
      { name: '--dsw-alias-bg-layer-1', label: '主面板' },
      { name: '--dsw-alias-bg-layer-2', label: '嵌套面板' },
      { name: '--dsw-alias-bg-layer-3', label: '卡片 / 浮层' },
      { name: '--dsw-alias-bg-overlay', label: '弹窗背景' },
      { name: '--dsw-alias-border-l1', label: '边框 · 细' },
      { name: '--dsw-alias-border-l2', label: '边框 · 常规' },
      { name: '--dsw-alias-border-l3', label: '边框 · 强调' },
      { name: '--dsw-alias-label-primary', label: '文字 · 主' },
      { name: '--dsw-alias-label-secondary', label: '文字 · 次' },
      { name: '--dsw-alias-label-tertiary', label: '文字 · 弱' },
      { name: '--dsw-alias-brand-primary', label: '品牌强调' },
      { name: '--dsw-specific-sidebar-fill', label: '侧边栏背景' },
      { name: '--dsw-specific-sidebar-nav-item-hover', label: '侧边栏 · 悬停' },
      { name: '--dsw-specific-sidebar-nav-item-active', label: '侧边栏 · 选中' },
      { name: '--dsw-specific-sidebar-nav-item-active-accent', label: '侧边栏 · 选中强调' },
      { name: '--dsw-alias-scrollbar-bg-l1', label: '滚动条' },
      { name: '--dsw-alias-scrollbar-hover-l1', label: '滚动条 · 悬停' },
    ],
  },
  {
    id: 'controls',
    label: '按钮与输入',
    description: '按钮体系、输入框与通用交互态。',
    fields: [
      { name: '--dsw-specific-input-major', label: '主输入框' },
      { name: '--dsw-specific-login-input', label: '登录输入框' },
      { name: '--dsw-alias-button-primary-fill', label: '主按钮' },
      { name: '--dsw-alias-button-primary-hover', label: '主按钮 · 悬停' },
      { name: '--dsw-alias-button-primary-dimmed', label: '主按钮 · 弱化' },
      { name: '--dsw-alias-button-ghost-active-fill', label: '幽灵按钮 · 选中' },
      { name: '--dsw-alias-button-ghost-active-hover', label: '幽灵按钮 · 悬停' },
      { name: '--dsw-alias-button-ghost-active-border', label: '幽灵按钮 · 边框' },
      { name: '--dsw-alias-button-info-fill', label: '信息按钮' },
      { name: '--dsw-alias-button-info-hover', label: '信息按钮 · 悬停' },
      { name: '--dsw-alias-interactive-bg-hover', label: '交互元素 · 悬停' },
      { name: '--dsw-alias-interactive-bg-active', label: '交互元素 · 按下' },
      { name: '--dsw-alias-interactive-bg-hover-danger', label: '交互元素 · 危险悬停' },
    ],
  },
  {
    id: 'markdown',
    label: 'Markdown 与代码',
    description: '消息气泡、Markdown 标注与代码块 / 语法高亮。可与窗口主题分开设置。',
    fields: [
      { name: '--dsw-specific-bubble', label: '消息气泡' },
      { name: '--dsw-specific-bubble-highlight', label: '气泡 · 高亮 / 引用' },
      { name: '--dsw-alias-markdown-code-block', label: '代码块背景' },
      { name: '--dsw-alias-markdown-code-block-banner', label: '代码块标题栏' },
      { name: '--dsw-alias-markdown-inline-code', label: '行内代码' },
      { name: '--dsw-alias-markdown-citation', label: '引用标注' },
      { name: '--dsw-alias-markdown-tag', label: '标签高亮' },
      { name: '--dsw-alias-markdown-placeholder', label: '占位文字' },
      { name: '--dsw-alias-markdown-code-segment-selected', label: '代码段 · 选中' },
      { name: '--dsw-alias-markdown-code-segment-unselected', label: '代码段 · 未选中' },
      { name: '--shiki-foreground', label: '语法 · 前景' },
      { name: '--shiki-background', label: '语法 · 背景' },
      { name: '--shiki-token-comment', label: '语法 · 注释' },
      { name: '--shiki-token-keyword', label: '语法 · 关键字' },
      { name: '--shiki-token-string', label: '语法 · 字符串' },
      { name: '--shiki-token-function', label: '语法 · 函数' },
      { name: '--shiki-token-constant', label: '语法 · 常量' },
      { name: '--shiki-token-parameter', label: '语法 · 参数' },
      { name: '--shiki-token-punctuation', label: '语法 · 标点' },
      { name: '--shiki-token-link', label: '语法 · 链接' },
      { name: '--shiki-token-string-expression', label: '语法 · 表达式' },
    ],
  },
  {
    id: 'status',
    label: '状态色',
    description: '错误 / 成功 / 警告 / 业务强调，供状态条、徽标与反馈使用。',
    fields: [
      { name: '--dsw-alias-state-error-primary', label: '错误色' },
      { name: '--dsw-alias-state-success-primary', label: '成功色' },
      { name: '--dsw-alias-state-warn-primary', label: '警告色' },
      { name: '--dsw-alias-state-business-primary', label: '业务强调色' },
    ],
  },
]

/** 全部可编辑字段（跨组拍平，保持既有 isDefaultField / 卡片预览兼容）。 */
export const TOKEN_FIELDS: TokenField[] = TOKEN_GROUPS.flatMap((g) => g.fields)

/*────────────────────────────── 颜色派生工具 ──────────────────────────────*/

interface Rgb { r: number; g: number; b: number }

function parseHex(hex: string): Rgb {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = Number.parseInt(h.slice(0, 6), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** 两个十六进制色线性混合（t=0 取 a，t=1 取 b）。 */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t })
}

/** 十六进制色转 rgba() 字符串（用于边框 / hover 等半透明层级）。 */
export function alphaHex(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex)
  const a = Math.max(0, Math.min(1, alpha)).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/*────────────────────────────── 全量 token 派生 ──────────────────────────────*/
/* 预设只维护 11 个核心种子色；其余按钮 / 输入框 / Markdown / 代码 / 侧边栏
 * token 由核心色派生，保证同一家族内所有部件色彩一致。 */

function deriveThemeTokens(
  base: Record<string, string>,
  scheme: 'light' | 'dark',
): Record<string, string> {
  const bgBase = base['--dsw-alias-bg-base']
  const bgLayer1 = base['--dsw-alias-bg-layer-1']
  const bgLayer2 = base['--dsw-alias-bg-layer-2']
  const labelPrimary = base['--dsw-alias-label-primary']
  const labelSecondary = base['--dsw-alias-label-secondary']
  const brand = base['--dsw-alias-brand-primary']
  const error = base['--dsw-alias-state-error-primary']
  const success = base['--dsw-alias-state-success-primary']
  const warn = base['--dsw-alias-state-warn-primary']

  const dark = scheme === 'dark'
  const bgLayer3 = dark ? mixHex(bgLayer2, labelPrimary, 0.08) : mixHex(bgLayer2, bgLayer1, 0.55)
  const bgOverlay = dark ? mixHex(bgLayer2, labelPrimary, 0.14) : mixHex(bgLayer2, bgLayer1, 0.35)
  const inputMajor = dark ? mixHex(bgLayer1, bgBase, 0.45) : bgLayer1
  const codeBlock = dark ? mixHex(bgBase, labelPrimary, 0.06) : mixHex(bgBase, labelPrimary, 0.04)
  const codeBanner = mixHex(codeBlock, bgLayer1, 0.5)
  const shikiKeyword = mixHex(brand, error, 0.55)
  const shikiFunction = mixHex(brand, success, 0.55)
  const shikiConstant = mixHex(brand, success, 0.35)

  return {
    ...base,
    '--dsw-alias-bg-layer-3': bgLayer3,
    '--dsw-alias-bg-overlay': bgOverlay,
    '--dsw-alias-border-l1': alphaHex(labelPrimary, dark ? 0.08 : 0.06),
    '--dsw-alias-border-l3': alphaHex(labelPrimary, dark ? 0.22 : 0.16),
    '--dsw-alias-label-tertiary': mixHex(labelSecondary, bgBase, 0.35),
    '--dsw-specific-sidebar-nav-item-hover': alphaHex(labelPrimary, dark ? 0.08 : 0.06),
    '--dsw-specific-sidebar-nav-item-active': alphaHex(brand, dark ? 0.16 : 0.12),
    '--dsw-specific-sidebar-nav-item-active-accent': alphaHex(brand, dark ? 0.20 : 0.16),
    '--dsw-alias-scrollbar-bg-l1': alphaHex(labelSecondary, 0.35),
    '--dsw-alias-scrollbar-hover-l1': alphaHex(labelSecondary, 0.55),
    '--dsw-specific-input-major': inputMajor,
    '--dsw-specific-login-input': mixHex(inputMajor, bgBase, 0.5),
    '--dsw-alias-button-primary-fill': brand,
    '--dsw-alias-button-primary-hover': mixHex(brand, labelPrimary, 0.15),
    '--dsw-alias-button-primary-dimmed': mixHex(brand, bgLayer1, 0.55),
    '--dsw-alias-button-ghost-active-fill': alphaHex(brand, 0.14),
    '--dsw-alias-button-ghost-active-hover': alphaHex(brand, 0.22),
    '--dsw-alias-button-ghost-active-border': mixHex(brand, labelSecondary, 0.35),
    '--dsw-alias-button-info-fill': brand,
    '--dsw-alias-button-info-hover': mixHex(brand, labelPrimary, 0.15),
    '--dsw-alias-interactive-bg-hover': alphaHex(brand, 0.10),
    '--dsw-alias-interactive-bg-active': alphaHex(brand, 0.16),
    '--dsw-alias-interactive-bg-hover-danger': alphaHex(error, 0.12),
    '--dsw-specific-bubble': alphaHex(brand, 0.08),
    '--dsw-specific-bubble-highlight': alphaHex(brand, 0.16),
    '--dsw-alias-markdown-code-block': codeBlock,
    '--dsw-alias-markdown-code-block-banner': codeBanner,
    '--dsw-alias-markdown-inline-code': alphaHex(brand, 0.12),
    '--dsw-alias-markdown-citation': alphaHex(brand, 0.08),
    '--dsw-alias-markdown-tag': alphaHex(brand, 0.16),
    '--dsw-alias-markdown-placeholder': mixHex(labelSecondary, bgBase, 0.45),
    '--dsw-alias-markdown-code-segment-selected': bgLayer2,
    '--dsw-alias-markdown-code-segment-unselected': codeBlock,
    '--shiki-foreground': labelPrimary,
    '--shiki-background': codeBlock,
    '--shiki-token-comment': labelSecondary,
    '--shiki-token-keyword': shikiKeyword,
    '--shiki-token-string': success,
    '--shiki-token-function': shikiFunction,
    '--shiki-token-constant': shikiConstant,
    '--shiki-token-parameter': warn,
    '--shiki-token-punctuation': labelSecondary,
    '--shiki-token-link': brand,
    '--shiki-token-string-expression': mixHex(success, warn, 0.5),
    '--dsw-alias-state-business-primary': mixHex(brand, success, 0.25),

    /* ── 补齐官方按钮/工具/状态辅助 token：让它们跟随主题层级而非官方固定灰 ── */
    // 高置按钮（如「新会话」）：随主题明暗的主体面
    '--dsw-alias-button-elevated-fill': dark ? mixHex(bgLayer1, labelPrimary, 0.05) : bgLayer1,
    '--dsw-alias-button-floating-fill': alphaHex(labelPrimary, dark ? 0.06 : 0.04),
    '--dsw-alias-button-floating-hover': alphaHex(labelPrimary, dark ? 0.12 : 0.08),
    '--dsw-alias-button-contrast-fill': labelPrimary,
    '--dsw-alias-button-tool-bar-fill': alphaHex(labelPrimary, dark ? 0.04 : 0.03),
    '--dsw-alias-button-tool-bar-fill-invisible': 'transparent',
    '--dsw-alias-button-tool-bar-hover': alphaHex(labelPrimary, dark ? 0.09 : 0.06),
    // 交互实底 / accent 悬停
    '--dsw-alias-interactive-bg-hover-solid': alphaHex(brand, dark ? 0.16 : 0.12),
    '--dsw-alias-interactive-bg-hover-accent': alphaHex(brand, dark ? 0.14 : 0.10),
    // 掩膜 / 多选 / 骨架 —— 弱中性层
    '--dsw-alias-bg-mask': alphaHex(bgBase, dark ? 0.55 : 0.45),
    '--dsw-alias-bg-mask-drop': alphaHex(bgBase, dark ? 0.60 : 0.50),
    '--dsw-alias-bg-mask-photo': alphaHex(bgBase, 0.6),
    '--dsw-alias-bg-module-platform': bgLayer2,
    '--dsw-alias-bg-multi-select': alphaHex(brand, dark ? 0.18 : 0.12),
    '--dsw-alias-bg-skeleton': alphaHex(labelSecondary, 0.12),
    // 反向 / 品牌文字 / 强调文字
    '--dsw-alias-border-inverted': labelPrimary,
    '--dsw-alias-brand-primary-invert': mixHex(brand, labelPrimary, 0.3),
    '--dsw-alias-brand-text': brand,
    // 文字弱层级
    '--dsw-alias-label-caption': mixHex(labelSecondary, bgBase, 0.3),
    '--dsw-alias-label-dimmed': mixHex(labelSecondary, bgBase, 0.55),
    '--dsw-alias-label-primary-bluish': labelPrimary,
    '--dsw-alias-label-primary-dimmed': mixHex(labelPrimary, bgBase, 0.2),
    '--dsw-alias-label-primary-foreground': bgLayer1,
    '--dsw-alias-label-primary-inverted': bgBase,
    // 状态次级/三级
    '--dsw-alias-state-business-tertiary': alphaHex(mixHex(brand, success, 0.25), 0.4),
    '--dsw-alias-state-error-secondary': alphaHex(error, 0.14),
    '--dsw-alias-state-error-tertiary': alphaHex(error, 0.08),
    '--dsw-alias-state-success-secondary': alphaHex(success, 0.14),
    '--dsw-alias-state-success-tertiary': alphaHex(success, 0.08),
    '--dsw-alias-state-warn-secondary': alphaHex(warn, 0.14),
    '--dsw-alias-state-warn-tertiary': alphaHex(warn, 0.08),
    '--dsw-alias-state-warn-label': warn,
    // 提示 / 浮层
    '--dsw-alias-toast-bg': dark ? mixHex(bgLayer2, labelPrimary, 0.18) : bgOverlay,
    '--dsw-alias-tooltip-bg': dark ? mixHex(bgLayer2, labelPrimary, 0.22) : mixHex(bgLayer3, bgBase, 0.4),
  }
}

/*────────────────────────────── 预设主题 ──────────────────────────────*/
/* 每个家族提供 dark + light 两个变体，保证同一风格适配深浅色。 */

function family(
  key: string,
  name: string,
  darkTokens: Record<string, string>,
  lightTokens: Record<string, string>,
): WebUITheme[] {
  return [
    {
      id: `${key}-dark`,
      name: `${name} · 深色`,
      description: `${name} 风格的深色版`,
      colorScheme: 'dark' as const,
      builtin: true,
      kind: 'preset' as const,
      tokens: deriveThemeTokens(darkTokens, 'dark'),
    },
    {
      id: `${key}-light`,
      name: `${name} · 浅色`,
      description: `${name} 风格的浅色版`,
      colorScheme: 'light' as const,
      builtin: true,
      kind: 'preset' as const,
      tokens: deriveThemeTokens(lightTokens, 'light'),
    },
  ]
}

/** 官方内置主题：跟随系统 / 深色 / 浅色（直接用官方 base palette，无 token 覆盖）。 */
export const OFFICIAL_THEMES: readonly WebUITheme[] = Object.freeze([
  {
    id: 'system',
    name: '官方 · 跟随系统',
    description: '浅色/深色跟随系统设置（官方默认）',
    colorScheme: 'light' as const,
    builtin: true,
    kind: 'official' as const,
    tokens: {},
  },
  {
    id: 'dark',
    name: '官方 · 深色',
    description: 'DeepSeek 官方深色主题',
    colorScheme: 'dark' as const,
    builtin: true,
    kind: 'official' as const,
    tokens: {},
  },
  {
    id: 'light',
    name: '官方 · 浅色',
    description: 'DeepSeek 官方浅色主题',
    colorScheme: 'light' as const,
    builtin: true,
    kind: 'official' as const,
    tokens: {},
  },
])

export const BUILTIN_THEMES: readonly WebUITheme[] = Object.freeze([
  // 注意：此处故意只含「预设风格」（14 = 7 家族 × 深浅），官方主题由
  // OFFICIAL_THEMES 单独提供，controller 合并后再进面板 —— 保证 BUILTIN
  // 语义 = 可自定义的预设（无官方空 tokens，测试/派生逻辑不受影响）。
  ...family(
    'ocean',
    '海洋 Ocean',
    {
      '--dsw-alias-bg-base': '#0b1220',
      '--dsw-alias-bg-layer-1': '#101b2e',
      '--dsw-alias-bg-layer-2': '#16233a',
      '--dsw-alias-border-l2': '#2a4466',
      '--dsw-alias-label-primary': '#e8eef7',
      '--dsw-alias-label-secondary': '#a7b8d3',
      '--dsw-alias-brand-primary': '#4f9cf9',
      '--dsw-alias-state-success-primary': '#3ecf8e',
      '--dsw-alias-state-error-primary': '#f26d6d',
      '--dsw-alias-state-warn-primary': '#f2b84b',
      '--dsw-specific-sidebar-fill': '#0e1830',
      '--dsh-kit-frame-grad': 'radial-gradient(140% 70% at 50% -20%, color-mix(in srgb, #4f9cf9 9%, transparent) 0%, transparent 60%), var(--dsw-specific-sidebar-fill)',
    },
    {
      '--dsw-alias-bg-base': '#f4f8fc',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-bg-layer-2': '#e3ecf7',
      '--dsw-alias-border-l2': '#c2d4e8',
      '--dsw-alias-label-primary': '#17273c',
      '--dsw-alias-label-secondary': '#506780',
      '--dsw-alias-brand-primary': '#2f7fd9',
      '--dsw-alias-state-success-primary': '#168a55',
      '--dsw-alias-state-error-primary': '#d94b4b',
      '--dsw-alias-state-warn-primary': '#c98a1f',
      '--dsw-specific-sidebar-fill': '#e7eff8',
      '--dsh-kit-frame-grad': 'radial-gradient(140% 70% at 50% -20%, color-mix(in srgb, #2f7fd9 11%, transparent) 0%, transparent 62%), var(--dsw-specific-sidebar-fill)',
    },
  ),
  ...family(
    'sakura',
    '樱 Sakura',
    {
      '--dsw-alias-bg-base': '#140d12',
      '--dsw-alias-bg-layer-1': '#1d1318',
      '--dsw-alias-bg-layer-2': '#2a1b22',
      '--dsw-alias-border-l2': '#4a2e3b',
      '--dsw-alias-label-primary': '#f6e9ee',
      '--dsw-alias-label-secondary': '#d3aeba',
      '--dsw-alias-brand-primary': '#f26d9d',
      '--dsw-alias-state-success-primary': '#4ade80',
      '--dsw-alias-state-error-primary': '#fb7185',
      '--dsw-alias-state-warn-primary': '#fbbf24',
      '--dsw-specific-sidebar-fill': '#170e14',
    },
    {
      '--dsw-alias-bg-base': '#fdf6f8',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-bg-layer-2': '#f7e3ea',
      '--dsw-alias-border-l2': '#ecc9d4',
      '--dsw-alias-label-primary': '#3b1f2a',
      '--dsw-alias-label-secondary': '#805564',
      '--dsw-alias-brand-primary': '#d84f83',
      '--dsw-alias-state-success-primary': '#1e9e5a',
      '--dsw-alias-state-error-primary': '#d9435f',
      '--dsw-alias-state-warn-primary': '#c9881f',
      '--dsw-specific-sidebar-fill': '#fbeaf0',
    },
  ),
  ...family(
    'forest',
    '森林 Forest',
    {
      '--dsw-alias-bg-base': '#0f1712',
      '--dsw-alias-bg-layer-1': '#152019',
      '--dsw-alias-bg-layer-2': '#1d2c22',
      '--dsw-alias-border-l2': '#2e4a38',
      '--dsw-alias-label-primary': '#e4f0e6',
      '--dsw-alias-label-secondary': '#a3bdaa',
      '--dsw-alias-brand-primary': '#3fa66a',
      '--dsw-alias-state-success-primary': '#38c172',
      '--dsw-alias-state-error-primary': '#ef6b6b',
      '--dsw-alias-state-warn-primary': '#e2ac3f',
      '--dsw-specific-sidebar-fill': '#122019',
    },
    {
      '--dsw-alias-bg-base': '#f2f8f3',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-bg-layer-2': '#e2efe5',
      '--dsw-alias-border-l2': '#c2dcc7',
      '--dsw-alias-label-primary': '#1c2e21',
      '--dsw-alias-label-secondary': '#56715c',
      '--dsw-alias-brand-primary': '#1f8b52',
      '--dsw-alias-state-success-primary': '#157d3f',
      '--dsw-alias-state-error-primary': '#d84040',
      '--dsw-alias-state-warn-primary': '#b97816',
      '--dsw-specific-sidebar-fill': '#e6f1e8',
    },
  ),
  ...family(
    'space',
    '深空 Space',
    {
      '--dsw-alias-bg-base': '#0a0e16',
      '--dsw-alias-bg-layer-1': '#111624',
      '--dsw-alias-bg-layer-2': '#192131',
      '--dsw-alias-border-l2': '#2d3a50',
      '--dsw-alias-label-primary': '#eef1f7',
      '--dsw-alias-label-secondary': '#a5b1c5',
      '--dsw-alias-brand-primary': '#7c9cf5',
      '--dsw-alias-state-success-primary': '#34d399',
      '--dsw-alias-state-error-primary': '#f87171',
      '--dsw-alias-state-warn-primary': '#fbbf24',
      '--dsw-specific-sidebar-fill': '#0d1320',
      '--dsh-kit-frame-grad': 'radial-gradient(140% 70% at 50% -20%, color-mix(in srgb, #7c9cf5 8%, transparent) 0%, transparent 60%), var(--dsw-specific-sidebar-fill)',
    },
    {
      '--dsw-alias-bg-base': '#f2f4fb',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-bg-layer-2': '#e6ebf7',
      '--dsw-alias-border-l2': '#c2cde6',
      '--dsw-alias-label-primary': '#1b2440',
      '--dsw-alias-label-secondary': '#5b6f8f',
      '--dsw-alias-brand-primary': '#4f6fe0',
      '--dsw-alias-state-success-primary': '#159f66',
      '--dsw-alias-state-error-primary': '#d94055',
      '--dsw-alias-state-warn-primary': '#c28718',
      '--dsw-specific-sidebar-fill': '#e7ecf8',
      '--dsh-kit-frame-grad': 'radial-gradient(140% 70% at 50% -20%, color-mix(in srgb, #4f6fe0 10%, transparent) 0%, transparent 62%), var(--dsw-specific-sidebar-fill)',
    },
  ),
  ...family(
    'graphite',
    '石墨 Graphite',
    {
      '--dsw-alias-bg-base': '#111214',
      '--dsw-alias-bg-layer-1': '#18191c',
      '--dsw-alias-bg-layer-2': '#222326',
      '--dsw-alias-border-l2': '#35373c',
      '--dsw-alias-label-primary': '#f0f0f2',
      '--dsw-alias-label-secondary': '#a2a4aa',
      '--dsw-alias-brand-primary': '#9aa0aa',
      '--dsw-alias-state-success-primary': '#4ade80',
      '--dsw-alias-state-error-primary': '#f87171',
      '--dsw-alias-state-warn-primary': '#facc15',
      '--dsw-specific-sidebar-fill': '#17181b',
    },
    {
      '--dsw-alias-bg-base': '#f4f4f5',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-bg-layer-2': '#e9e9ec',
      '--dsw-alias-border-l2': '#cfd0d6',
      '--dsw-alias-label-primary': '#232327',
      '--dsw-alias-label-secondary': '#6a6b72',
      '--dsw-alias-brand-primary': '#66676e',
      '--dsw-alias-state-success-primary': '#1a9c5a',
      '--dsw-alias-state-error-primary': '#d84646',
      '--dsw-alias-state-warn-primary': '#b8860b',
      '--dsw-specific-sidebar-fill': '#eceae9',
    },
  ),
  ...family(
    'neon',
    '霓虹 Neon',
    {
      '--dsw-alias-bg-base': '#0d0f1a',
      '--dsw-alias-bg-layer-1': '#161933',
      '--dsw-alias-bg-layer-2': '#1f2450',
      '--dsw-alias-border-l2': '#343a78',
      '--dsw-alias-label-primary': '#f1f2ff',
      '--dsw-alias-label-secondary': '#b3b8e6',
      '--dsw-alias-brand-primary': '#818cf8',
      '--dsw-alias-state-success-primary': '#22d3ee',
      '--dsw-alias-state-error-primary': '#f472b6',
      '--dsw-alias-state-warn-primary': '#fde047',
      '--dsw-specific-sidebar-fill': '#10142a',
      '--dsh-kit-frame-grad': 'radial-gradient(140% 70% at 50% -20%, color-mix(in srgb, #a78bfa 10%, transparent) 0%, transparent 60%), var(--dsw-specific-sidebar-fill)',
    },
    {
      '--dsw-alias-bg-base': '#f6f6ff',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-bg-layer-2': '#e9e9ff',
      '--dsw-alias-border-l2': '#c8c8f2',
      '--dsw-alias-label-primary': '#1f2350',
      '--dsw-alias-label-secondary': '#5a5f9e',
      '--dsw-alias-brand-primary': '#6366f1',
      '--dsw-alias-state-success-primary': '#0e9bb8',
      '--dsw-alias-state-error-primary': '#db3f8f',
      '--dsw-alias-state-warn-primary': '#a98c0b',
      '--dsw-specific-sidebar-fill': '#ececff',
      '--dsh-kit-frame-grad': 'radial-gradient(140% 70% at 50% -20%, color-mix(in srgb, #8b5cf6 12%, transparent) 0%, transparent 62%), var(--dsw-specific-sidebar-fill)',
    },
  ),
  ...family(
    'solar',
    '暖阳 Solar',
    {
      '--dsw-alias-bg-base': '#161210',
      '--dsw-alias-bg-layer-1': '#1f1915',
      '--dsw-alias-bg-layer-2': '#2b2219',
      '--dsw-alias-border-l2': '#4a3c2c',
      '--dsw-alias-label-primary': '#f7f0e6',
      '--dsw-alias-label-secondary': '#c4b49d',
      '--dsw-alias-brand-primary': '#f59e0b',
      '--dsw-alias-state-success-primary': '#34c98a',
      '--dsw-alias-state-error-primary': '#f9736c',
      '--dsw-alias-state-warn-primary': '#fbbf24',
      '--dsw-specific-sidebar-fill': '#1a1512',
      '--dsh-kit-frame-grad': 'radial-gradient(140% 70% at 50% -20%, color-mix(in srgb, #f59e0b 9%, transparent) 0%, transparent 60%), var(--dsw-specific-sidebar-fill)',
    },
    {
      '--dsw-alias-bg-base': '#faf6f0',
      '--dsw-alias-bg-layer-1': '#ffffff',
      '--dsw-alias-bg-layer-2': '#f1e8da',
      '--dsw-alias-border-l2': '#dccbb4',
      '--dsw-alias-label-primary': '#33281c',
      '--dsw-alias-label-secondary': '#7d6c55',
      '--dsw-alias-brand-primary': '#d97706',
      '--dsw-alias-state-success-primary': '#168a55',
      '--dsw-alias-state-error-primary': '#d24040',
      '--dsw-alias-state-warn-primary': '#b07a00',
      '--dsw-specific-sidebar-fill': '#f1e9dd',
      '--dsh-kit-frame-grad': 'radial-gradient(140% 70% at 50% -20%, color-mix(in srgb, #d97706 12%, transparent) 0%, transparent 62%), var(--dsw-specific-sidebar-fill)',
    },
  ),
])

/*────────────────────────────── 编辑器默认配色 ──────────────────────────────*/
/* 新建 / 切换深浅底时的默认主题 token（与官方 design-platform 的明暗基调一致）。 */

const BASE_DARK_DEFAULTS: Record<string, string> = {
  '--dsw-alias-bg-base': '#16181d',
  '--dsw-alias-bg-layer-1': '#1e2128',
  '--dsw-alias-bg-layer-2': '#272b33',
  '--dsw-alias-border-l2': '#3a3f4b',
  '--dsw-alias-label-primary': '#e6e8ee',
  '--dsw-alias-label-secondary': '#9aa1ae',
  '--dsw-alias-brand-primary': '#3b82f6',
  '--dsw-alias-state-success-primary': '#22c55e',
  '--dsw-alias-state-error-primary': '#ef4444',
  '--dsw-alias-state-warn-primary': '#eab308',
  '--dsw-specific-sidebar-fill': '#1a1d24',
}

const BASE_LIGHT_DEFAULTS: Record<string, string> = {
  '--dsw-alias-bg-base': '#f5f5f5',
  '--dsw-alias-bg-layer-1': '#ffffff',
  '--dsw-alias-bg-layer-2': '#eef0f2',
  '--dsw-alias-border-l2': '#d9dde3',
  '--dsw-alias-label-primary': '#1b1f27',
  '--dsw-alias-label-secondary': '#5b626d',
  '--dsw-alias-brand-primary': '#2563eb',
  '--dsw-alias-state-success-primary': '#16a34a',
  '--dsw-alias-state-error-primary': '#dc2626',
  '--dsw-alias-state-warn-primary': '#ca8a04',
  '--dsw-specific-sidebar-fill': '#e7e9ee',
}

export const DEFAULT_DARK_THEME_TOKENS: Record<string, string> =
  deriveThemeTokens(BASE_DARK_DEFAULTS, 'dark')

export const DEFAULT_LIGHT_THEME_TOKENS: Record<string, string> =
  deriveThemeTokens(BASE_LIGHT_DEFAULTS, 'light')

/*────────────────────────────── 持久化 ──────────────────────────────*/

const LS_KEY = 'dsh-kit-webui.themes.v1'

export interface StoredData {
  /** 用户自建主题（builtin: false）。 */
  custom: WebUITheme[]
  /** 当前选中的主题 id（仅本店主题；官方 light/dark/system 由官方 settings 持久化）。 */
  active: string | null
  /** 全局界面调整层（对所有主题生效；空对象 = 无调整）。 */
  global: Record<string, TokenModes>
}

export function loadStored(): StoredData {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { custom: [], active: null, global: {} }
    const parsed = JSON.parse(raw) as { custom?: unknown; active?: unknown; global?: unknown }
    const custom = Array.isArray(parsed.custom)
      ? (parsed.custom as WebUITheme[]).filter(isThemeLike)
      : []
    const active = typeof parsed.active === 'string' ? parsed.active : null
    const global = isTokenMap(parsed.global) ? (parsed.global as Record<string, TokenModes>) : {}
    return { custom, active, global }
  } catch {
    return { custom: [], active: null, global: {} }
  }
}

export function saveStored(data: StoredData): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch {
    // 隐私模式 / 配额满：静默忽略（主题商店只是增强功能）
  }
}

function isThemeLike(x: unknown): x is WebUITheme {
  const t = x as { id?: unknown; name?: unknown; colorScheme?: unknown; tokens?: unknown }
  return typeof t?.id === 'string' && typeof t?.name === 'string'
    && (t.colorScheme === 'light' || t.colorScheme === 'dark')
    && typeof t.tokens === 'object' && t.tokens !== null
}

function isTokenMap(x: unknown): boolean {
  if (typeof x !== 'object' || x === null) return false
  return Object.values(x as Record<string, unknown>).every((v) =>
    typeof v === 'object' && v !== null
    && typeof (v as { light?: unknown }).light === 'string'
    && typeof (v as { dark?: unknown }).dark === 'string',
  )
}

/**
 * 在全局叠加层中设置某个 token 的一个模式值。
 * 官方 overrideTokens 要求 light/dark 双值：另一模式为空时回填同值，
 * 保证切到该模式时得到合法的 CSS 值（空字符串会让 token 失效）。
 */
export function setTokenMode(
  tokens: Record<string, TokenModes>,
  name: string,
  mode: 'light' | 'dark',
  value: string,
): Record<string, TokenModes> {
  const cur = tokens[name] ?? { light: '', dark: '' }
  const other = mode === 'light' ? 'dark' : 'light'
  const nextOther = cur[other] === '' ? value : cur[other]
  return { ...tokens, [name]: { ...cur, [mode]: value, [other]: nextOther } }
}
