/**
 * dsh-studio-webui 右侧栏「信息」页 —— 实时会话统计（Dashboard 仪表盘）。
 *
 * 设计：
 *   - 缓存命中：SVG 环形仪表盘（donut），动画绘制，作为视觉主角；
 *   - 关键指标：2×2 瓦片（轮次 / 步数 / 首 token / 吞吐）；
 *   - 耗时分布：LLM vs 工具 等比分段条 + 图例；
 *   - Token 体积：输入 vs 输出 等比分段条 + 图例；
 *   - 全部用 DSW alias token，自动跟随主题深浅色；
 *   - 数据用 useProjection 实时驱动；首帧有入场动画，后续数字就地更新。
 */
import { useEffect, useLayoutEffect, useState } from 'react'

type SelectorHook = <T, U = unknown>(
  selector: (value: T) => U,
  eq?: (a: U, b: U) => boolean,
) => U

type ProjectionHook = <T = unknown>(
  key: string,
  selector?: (value: unknown) => T,
  eq?: (a: T, b: T) => boolean,
) => T | undefined

/** useSession 读出的会话状态（含 legacy 节点流——流式更新引用，驱动实时）。 */
interface SessionState {
  chat: {
    legacy: {
      nodes: LegacyNode[]
    }
  }
}

/** legacy 节点最小结构（与官方 deriveStats 一致）。 */
interface LegacyNode {
  kind: string
  turn?: number
  time?: number
  callTime?: number | null
  timing?: {
    stepStartTime?: number | null
    completedTime?: number | null
    firstTokenTime?: number | null
  }
  usage?: {
    outputTokens?: number
  }
}

export interface StatsPanelEntryProps {
  useProjection: ProjectionHook
  useSession?: SelectorHook<SessionState>
}

interface SessionStats {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  ttftMs: number
  ttftSteps: number
  decodeMs: number
  decodeTokens: number
}

interface TokenUsage {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** layout.ts 创建右栏容器后派发，提示组件补写最新数据（面板是惰性创建）。 */
export const SYNC_EVENT = 'dsh-studio:stats-sync-request'

const HOLDER_SELECTOR = '.dsh-studio-info-stats'
const CARD_SELECTOR = '.dsh-studio-stats-card'

/* ── 与官方 StatsLine 一致的格式化工具（conversation 内部私有，这里复刻） ── */

function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

function formatDuration(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  const m = Math.floor(whole / 60)
  const rem = whole % 60
  if (m > 0 && rem === 0) return `${m}m`
  return `${m}m${rem}s`
}

function formatTokens(n: number): string {
  const scaled = (v: number) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1000)}K`
  return `${scaled(n / 1_000_000)}M`
}

function billedInputTokens(usage: TokenUsage): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

function cacheHitPercent(usage: TokenUsage): number | null {
  const denominator = billedInputTokens(usage)
  return denominator === 0 ? null : Math.round((usage.cacheReadTokens / denominator) * 100)
}

/**
 * 从会话 legacy 节点实时派生统计（复刻官方 deriveStats）。
 * 官方底部 StatsLine 正是靠 useSession 的节点流 + 这里实时更新——节点在
 * 流式 token / tool 执行时持续产生新引用，因此每帧都重算出新数值。
 */
function deriveStatsFromNodes(nodes: LegacyNode[]): SessionStats {
  const turns = new Set<number>()
  let steps = 0
  let llmMs = 0
  let toolMs = 0
  let ttftMs = 0
  let ttftSteps = 0
  let decodeMs = 0
  let decodeTokens = 0
  for (const node of nodes) {
    if (node.kind === 'tool-result') {
      if (node.callTime !== null && node.callTime !== undefined && node.time !== undefined) {
        toolMs += Math.max(0, node.time - node.callTime)
      }
      continue
    }
    if (node.kind !== 'assistant' || node.turn === undefined) continue
    turns.add(node.turn)
    steps += 1
    const timing = node.timing
    if (timing !== undefined && timing.stepStartTime !== null && timing.stepStartTime !== undefined && timing.completedTime !== undefined) {
      llmMs += Math.max(0, timing.completedTime - timing.stepStartTime)
    }
    if (timing !== undefined && timing.stepStartTime !== null && timing.stepStartTime !== undefined && timing.firstTokenTime !== null && timing.firstTokenTime !== undefined) {
      ttftMs += Math.max(0, timing.firstTokenTime - timing.stepStartTime)
      ttftSteps += 1
    }
    const out = node.usage?.outputTokens
    if (timing !== undefined && timing.firstTokenTime !== undefined && timing.completedTime !== undefined && typeof out === 'number' && timing.firstTokenTime !== null) {
      decodeMs += Math.max(0, timing.completedTime - timing.firstTokenTime)
      decodeTokens += out
    }
  }
  return { turns: turns.size, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens }
}

/* ── DOM 构建（纯 createElement / createElementNS，避免 innerHTML） ── */

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

/** 在卡片上定位一个带 data-k 的节点。 */
function nodeOf(card: HTMLElement, key: string): HTMLElement | null {
  return card.querySelector<HTMLElement>(`[data-k="${key}"]`)
}

/* ── 会话统计模型 ── */

interface Tile {
  key: string
  label: string
  value: string
  accent?: 'brand' | 'good' | 'warn'
}

interface Pair {
  key: string
  label: string
  value: string
  ratio: number // 0..1，用于分段条
}

interface StatsModel {
  cacheHit: number | null
  tiles: Tile[]
  timePair: Pair[] | null
  tokenPair: Pair[] | null
  hasData: boolean
  /** 哪些部分存在 —— 变了就重建，否则就地更新。 */
  signature: string
}

function collectModel(stats: SessionStats | undefined, usage: TokenUsage | undefined, cacheHit: number | null): StatsModel {
  const tiles: Tile[] = []
  const sig: string[] = []

  if (stats !== undefined && stats.steps > 0) {
    tiles.push({ key: 'turns', label: '轮次', value: String(stats.turns), accent: 'brand' })
    tiles.push({ key: 'steps', label: '步数', value: String(stats.steps), accent: 'brand' })
    sig.push('count')
    if (stats.ttftSteps > 0) tiles.push({ key: 'ttft', label: '平均首 token', value: formatDuration(stats.ttftMs / stats.ttftSteps), accent: 'good' })
    if (stats.decodeMs > 0) {
      tiles.push({ key: 'throughput', label: '解码吞吐', value: `${formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1000))} tok/s`, accent: 'good' })
    }
  }

  // 耗时分布
  let timePair: Pair[] | null = null
  if (stats !== undefined && stats.llmMs + stats.toolMs > 0) {
    const total = stats.llmMs + stats.toolMs
    const items: Pair[] = []
    if (stats.llmMs > 0) items.push({ key: 'llm', label: 'LLM', value: formatDuration(stats.llmMs), ratio: stats.llmMs / total })
    if (stats.toolMs > 0) items.push({ key: 'tool', label: '工具', value: formatDuration(stats.toolMs), ratio: stats.toolMs / total })
    timePair = items
    sig.push('time')
  }

  // Token 体积
  let tokenPair: Pair[] | null = null
  if (usage !== undefined && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
    const input = billedInputTokens(usage)
    const output = usage.outputTokens
    const total = input + output
    tokenPair = [
      { key: 'input', label: '输入', value: `${formatTokens(input)} tok`, ratio: total > 0 ? input / total : 0 },
      { key: 'output', label: '输出', value: `${formatTokens(output)} tok`, ratio: total > 0 ? output / total : 0 },
    ]
    sig.push('token')
  }

  if (cacheHit !== null) sig.push('cache')

  return {
    cacheHit,
    tiles,
    timePair,
    tokenPair,
    hasData: tiles.length > 0 || timePair !== null || tokenPair !== null || cacheHit !== null,
    signature: sig.join(',') + '|' + tiles.map((t) => t.key).join(','),
  }
}

/* ── 仪表盘构建（一次性） ── */

const DONUT_R = 42
const DONUT_C = 2 * Math.PI * DONUT_R

function buildCard(model: StatsModel): HTMLElement {
  const card = el('div', 'dsh-studio-stats-card')
  // 强锁（important 级内联）：卡片整体块级纵向，压过任何外部 stylesheet 的横向规则
  card.style.setProperty('display', 'block', 'important')
  card.style.setProperty('flex-direction', 'column', 'important')
  card.style.setProperty('flex-wrap', 'nowrap', 'important')
  card.style.setProperty('position', 'relative', 'important')

  // 标题行
  const head = el('div', 'dsh-studio-stats-head')
  // 内联 important：强制标题行横排居中，绝不竖排、绝不被改
  head.style.setProperty('display', 'flex', 'important')
  head.style.setProperty('flex-direction', 'row', 'important')
  head.style.setProperty('flex-wrap', 'nowrap', 'important')
  head.style.setProperty('align-items', 'center', 'important')
  head.style.setProperty('justify-content', 'center', 'important')
  head.appendChild(el('span', 'dsh-studio-stats-head-dot'))
  const titleEl = el('span', 'dsh-studio-stats-head-title', '会话统计')
  titleEl.style.setProperty('white-space', 'nowrap', 'important')
  titleEl.style.setProperty('overflow', 'hidden', 'important')
  titleEl.style.setProperty('text-overflow', 'ellipsis', 'important')
  titleEl.style.setProperty('min-width', '0', 'important')
  head.appendChild(titleEl)
  const live = el('span', 'dsh-studio-stats-live')
  live.style.setProperty('flex', 'none', 'important')
  live.style.setProperty('white-space', 'nowrap', 'important')
  live.appendChild(el('span', 'dsh-studio-stats-live-dot'))
  live.appendChild(el('span', null, '实时'))
  head.appendChild(live)
  card.appendChild(head)

  const body = el('div', 'dsh-studio-stats-body')
  body.style.setProperty('display', 'block', 'important')
  body.style.setProperty('width', '100%', 'important')
  card.appendChild(body)

  // 缓存命中环形仪表
  if (model.cacheHit !== null) {
    const donutWrap = el('div', 'dsh-studio-stats-donut-wrap')
    const donut = svgEl('svg', {
      class: 'dsh-studio-stats-donut',
      viewBox: '0 0 110 110',
      role: 'img',
      'aria-label': `缓存命中 ${model.cacheHit}%`,
    })
    // 渐变描边：品牌蓝 → 成功绿
    const defs = svgEl('defs', {})
    const grad = svgEl('linearGradient', { id: 'dsh-studio-stats-donut-grad', x1: '0', y1: '0', x2: '1', y2: '1' })
    grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'var(--dsw-alias-state-business-primary)' }))
    grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'var(--dsw-alias-state-success-primary)' }))
    defs.appendChild(grad)

    const track = svgEl('circle', {
      cx: 55, cy: 55, r: DONUT_R,
      class: 'dsh-studio-stats-donut-track', fill: 'none',
    })
    const arc = svgEl('circle', {
      cx: 55, cy: 55, r: DONUT_R,
      class: 'dsh-studio-stats-donut-arc', fill: 'none',
    })
    donut.appendChild(defs)
    donut.appendChild(track)
    donut.appendChild(arc)
    donutWrap.appendChild(donut)

    const center = el('div', 'dsh-studio-stats-donut-center')
    const donutVal = el('span', 'dsh-studio-stats-donut-value', `${model.cacheHit}%`)
    donutVal.dataset.k = 'cache'
    center.appendChild(donutVal)
    center.appendChild(el('span', 'dsh-studio-stats-donut-label', '缓存命中'))
    donutWrap.appendChild(center)

    // 环形 + 右侧详情（宽容器并排，窄容器上下居中）
    const hero = el('div', 'dsh-studio-stats-hero')
    hero.appendChild(donutWrap)

    const detail = el('div', 'dsh-studio-stats-donut-detail')
    const cacheRow = el('div', 'dsh-studio-stats-cache-row')
    cacheRow.appendChild(el('div', 'dsh-studio-stats-cache-row-label', '缓存命中'))
    const pct = el('div', 'dsh-studio-stats-cache-pct', `${model.cacheHit}%`)
    pct.dataset.k = 'cache-pct'
    cacheRow.appendChild(pct)
    detail.appendChild(cacheRow)
    detail.appendChild(el('div', 'dsh-studio-stats-cache-sub', '提示词侧缓存占比'))
    hero.appendChild(detail)

    body.appendChild(hero)
  }

  // 关键指标瓦片
  if (model.tiles.length > 0) {
    const grid = el('div', 'dsh-studio-stats-grid')
    model.tiles.forEach((t, i) => {
      const tile = el('div', 'dsh-studio-stats-tile')
      tile.style.setProperty('--i', String(i))
      const label = el('div', 'dsh-studio-stats-tile-label', t.label)
      const valCls = t.accent ? `dsh-studio-stats-tile-value dsh-studio-accent-${t.accent}` : 'dsh-studio-stats-tile-value'
      const value = el('div', valCls, t.value)
      value.dataset.k = t.key
      tile.appendChild(label)
      tile.appendChild(value)
      grid.appendChild(tile)
    })
    body.appendChild(grid)
  }

  // 耗时分布
  if (model.timePair !== null && model.timePair.length > 0) {
    body.appendChild(buildSection('耗时分布', model.timePair, 'time'))
  }

  // Token 体积
  if (model.tokenPair !== null && model.tokenPair.length > 0) {
    body.appendChild(buildSection('Token 体积', model.tokenPair, 'token'))
  }

  return card
}

function buildSection(title: string, pairs: Pair[], prefix: string): HTMLElement {
  const section = el('div', 'dsh-studio-stats-section')
  section.appendChild(el('div', 'dsh-studio-stats-section-title', title))

  const bar = el('div', `dsh-studio-stats-pairbar dsh-studio-stats-pairbar-${prefix}`)
  for (const p of pairs) {
    const seg = el('div', '')
    seg.dataset.k = `${prefix}-${p.key}-seg`
    seg.style.width = `${Math.max(p.ratio * 100, 2)}%`
    bar.appendChild(seg)
  }
  section.appendChild(bar)

  const legend = el('div', 'dsh-studio-stats-pairlegend')
  for (const p of pairs) {
    const item = el('div', 'dsh-studio-stats-pairitem')
    item.appendChild(el('span', 'dsh-studio-stats-pairitem-swatch'))
    item.appendChild(el('span', 'dsh-studio-stats-pairitem-label', p.label))
    const value = el('span', 'dsh-studio-stats-pairitem-value')
    value.dataset.k = `${prefix}-${p.key}-value`
    value.textContent = p.value
    item.appendChild(value)
    legend.appendChild(item)
  }
  section.appendChild(legend)
  return section
}

/* ── 就地更新（数字实时变化时不清空重建） ── */

function updateCard(card: HTMLElement, model: StatsModel, cacheHit: number | null): void {
  setTextPulse(nodeOf(card, 'cache'), cacheHit !== null ? `${cacheHit}%` : null)
  setTextPulse(nodeOf(card, 'cache-pct'), cacheHit !== null ? `${cacheHit}%` : null)

  for (const t of model.tiles) {
    setTextPulse(nodeOf(card, t.key), t.value)
  }

  if (model.timePair) for (const p of model.timePair) {
    const seg = nodeOf(card, `time-${p.key}-seg`)
    if (seg) seg.style.width = `${Math.max(p.ratio * 100, 2)}%`
    setTextPulse(nodeOf(card, `time-${p.key}-value`), p.value)
  }

  if (model.tokenPair) for (const p of model.tokenPair) {
    const seg = nodeOf(card, `token-${p.key}-seg`)
    if (seg) seg.style.width = `${Math.max(p.ratio * 100, 2)}%`
    setTextPulse(nodeOf(card, `token-${p.key}-value`), p.value)
  }
  setDonutTarget(card, cacheHit)
}

/** 更新文本，若值变化则触发一次短暂高亮脉冲（实时更新的可视反馈）。 */
function setTextPulse(node: HTMLElement | null, value: string | null): void {
  if (!node || !value) return
  if (node.textContent === value) return
  node.textContent = value
  node.classList.remove('dsh-studio-flash')
  // 强制 reflow 让下一次 class 添加重新触发动画
  void node.offsetWidth
  node.classList.add('dsh-studio-flash')
  window.setTimeout(() => node.classList.remove('dsh-studio-flash'), 900)
}

/** 画环形动画：下一帧把卡片切到 live 态，促使 dashoffset 过渡。 */
function drawDonut(card: HTMLElement): void {
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('dsh-studio-stats-live')))
}

/** 把最新统计写进右侧栏「信息」页容器；容器还不存在则静默跳过。 */
function writeToPanel(stats: SessionStats | undefined, usage: TokenUsage | undefined): void {
  const holder = document.querySelector<HTMLElement>(HOLDER_SELECTOR)
  if (!holder) return
  const cacheHit = usage !== undefined ? cacheHitPercent(usage) : null
  const model = collectModel(stats, usage, cacheHit)

  if (!model.hasData) {
    const empty = el('div', 'dsh-studio-info-empty', '暂无会话统计')
    holder.replaceChildren(empty)
    return
  }

  let card = holder.querySelector<HTMLElement>(CARD_SELECTOR)
  if (card === null || card.dataset.sig !== model.signature) {
    card = buildCard(model)
    card.dataset.sig = model.signature
    setDonutTarget(card, model.cacheHit)
    holder.replaceChildren(card)
    drawDonut(card)
  } else {
    updateCard(card, model, cacheHit)
  }
}

/**
 * 立即记录环形弧的目标偏移 --donut-target；.live 态下 CSS 会过渡到它实现动画。
 * 初始（非 live）时弧 dashoffset 硬编码 264（全空），切 live 后过渡到目标。
 */
function setDonutTarget(card: HTMLElement, cacheHit: number | null): void {
  const pct = cacheHit === null ? 0 : Math.min(100, Math.max(0, cacheHit))
  card.style.setProperty('--dsh-studio-donut-c', `${DONUT_C}px`)
  card.style.setProperty('--donut-target', `${DONUT_C * (1 - pct / 100)}px`)
}

function StatsPanelEntry(_props: StatsPanelEntryProps): null {
  const useProjection = _props.useProjection
  const useSession = _props.useSession
  // syncTick 参与 effect 依赖：面板惰性创建后哪怕数据没变也要补写一次。
  const [syncTick, setSyncTick] = useState(0)

  const projected = useProjection<SessionStats | undefined>('sessionStats')
  const usage = useProjection<TokenUsage | undefined>('tokenUsage')
  // 会话 legacy 节点流：流式 token / tool 执行时不断产生新引用 → 实时派生。
  // 与官方底部 StatsLine 同源（useSession 节点 + deriveStats）。
  const nodes = useSession !== undefined
    ? (useSession((s) => s?.chat?.legacy?.nodes ?? []) ?? [])
    : []
  // 优先用节点实时派生（保证流式实时）；无节点时才回退投影。
  const stats = nodes.length > 0 ? deriveStatsFromNodes(nodes) : projected

  // 监听 layout.ts 派发的“面板就绪”事件：容器出现后立即补写（数据不变也会写）。
  useEffect(() => {
    const onSync = () => {
      writeToPanel(stats, usage)
      setSyncTick((x) => x + 1)
    }
    window.addEventListener(SYNC_EVENT, onSync)
    return () => window.removeEventListener(SYNC_EVENT, onSync)
  }, [stats, usage])

  // 数据变化（或 syncTick 变化）时写一次；stats 每次节点变化都是新对象 → 实时重写。
  useLayoutEffect(() => {
    writeToPanel(stats, usage)
  }, [stats, usage, syncTick])

  // 空根：不让官方 slot 在对话框下方渲染任何东西。
  return null
}

export { StatsPanelEntry, SYNC_EVENT }
