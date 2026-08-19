/** dsh-kit-webui host store: 主题定义的权威数据层（JSON 落盘）。 */

import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 与 client/src/client/themes.ts 的 WebUITheme 同构：tokens 是单值 CSS 字符串（官方 ThemeDefinition 形状）。 */
export interface ThemeRecord {
  id: string
  name: string
  description: string
  colorScheme: 'light' | 'dark'
  builtin: boolean
  tokens: Record<string, string>
}

export interface StoreState {
  /** 全部主题（内置 builtin + 用户自定义）。 */
  themes: ThemeRecord[]
  /** 当前选中的本店主题 id（跨 origin 共享；null = 跟随官方主题）。 */
  active?: string | null
  /** 全局界面调整层：token → { light, dark }（跨 origin 共享）。 */
  global?: Record<string, { light: string; dark: string }>
}

/** 「选中主题 + 全局调整层」也走服务端持久化：桌面与浏览器访问的是两个不同
 *  origin，localStorage 彼此隔离导致两处显示不一致。把这两份状态上收到 host，
 *  任何入口（loopback 桌面壳 / LAN HTTPS 网关）读到的是同一份数据。 */
export interface ThemeStoreState {
  active: string | null
  global: Record<string, { light: string; dark: string }>
}

function themeFile(stateDir: string): string {
  return join(stateDir, 'dsh-kit-webui/themes.json')
}

/** 兼容旧格式（只有 themes），读取完整状态。 */
export function loadStoreState(
  stateDir: string,
): { themes: ThemeRecord[]; active: string | null; global: Record<string, { light: string; dark: string }> } {
  try {
    const p = themeFile(stateDir)
    const s = JSON.parse(readFileSync(p, 'utf8')) as StoreState
    return {
      themes: Array.isArray(s.themes) ? s.themes : [],
      active: s.active ?? null,
      global: s.global ?? {},
    }
  } catch {
    return { themes: [], active: null, global: {} }
  }
}

export function loadThemes(stateDir: string): ThemeRecord[] {
  return loadStoreState(stateDir).themes
}

export function saveStoreState(stateDir: string, state: StoreState): void {
  const p = themeFile(stateDir)
  mkdirSync(dirname(p), { recursive: true })
  // Atomic write (tmp + rename): a crash mid-write must never leave a torn
  // themes file behind.
  const tmp = `${p}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, p)
}

export function saveThemes(stateDir: string, themes: ThemeRecord[]): void {
  saveStoreState(stateDir, { themes })
}

export function defaultStateDir(): string {
  return process.env.DSH_HOME ?? `${process.env.HOME ?? '.'}/.dsh`
}
