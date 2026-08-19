/** 自定义主题的「额外 token」编辑辅助。
 *
 * 预设/数据层本身支持任意 `--dsw-*`/`--dsw-alias-*` token（Record<string,string>），
 * 但 ui-editor 只渲染固定的 TOKEN_FIELDS。这里提供把额外 token 从主题拆出/合并的
 * 纯函数，让自定义主题可以编辑、新增固定字段之外的 token——不触碰内置默认字段。
 *
 * 同一套概念同时适配：
 *  - 主题层（单值 tokens: Record<string,string>）
 *  - 全局界面调整层（双值 tokens: Record<string, TokenModes>）
 */

import { TOKEN_FIELDS } from './themes.ts'
import type { TokenModes } from './themes.ts'

/** 可自定义额外 token 的 key 前缀（与官方 alias token 风格一致）。 */
export const EXTRA_TOKEN_PREFIX = '--dsw-alias-'

/** 一行额外 token（key 需以 EXTRA_TOKEN_PREFIX 开头，value 非空）。 */
export interface ExtraToken { key: string; value: string }

/** 全局界面调整层的「额外 token」一行（light/dark 双值）。 */
export interface ExtraTokenModes { key: string; value: TokenModes }

/** 判断一个 token key 是否是「内置默认字段」（由 ui-editor 用 color 控件编辑）。 */
export function isDefaultField(name: string): boolean {
  return TOKEN_FIELDS.some((f) => f.name === name)
}

/** 从主题 tokens 里拆出额外 token（排除内置默认字段）。 */
export function splitExtraTokens(tokens: Record<string, string>): ExtraToken[] {
  const out: ExtraToken[] = []
  for (const [key, value] of Object.entries(tokens)) {
    if (isDefaultField(key)) continue
    out.push({ key, value })
  }
  return out
}

/** 校验一个额外 token key：非空、以 -- 开头、且非内置默认字段。 */
export function isValidExtraKey(key: string): boolean {
  return key.startsWith('--') && !isDefaultField(key)
}

/** 把一组额外 token 合入原 tokens。
 *
 * 只合入「合法额外 key（-- 开头且非默认字段）且 value 非空」的行；
 * 非法 key 与空 value 忽略（UI 上留空的行就是“要删除”的语义）。
 */
export function mergeExtraTokens(
  base: Record<string, string>,
  extras: ExtraToken[],
): Record<string, string> {
  const out = { ...base }
  for (const e of extras) {
    if (!isValidExtraKey(e.key) || e.value === '') continue
    out[e.key] = e.value
  }
  return out
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** 该字符串是否像 CSS 颜色（十六进制，可作为彩色色板单元格）。 */
export function looksLikeColor(value: string): boolean {
  return HEX_RE.test(value.trim())
}

/** 提取可用于卡片色板预览的额外 token（仅十六进制色值，排除默认字段）。 */
export function colorSwatches(tokens: Record<string, string>): ExtraToken[] {
  return splitExtraTokens(tokens).filter((e) => looksLikeColor(e.value))
}

/*──────────────────────── 全局界面调整层（双值 TokenModes） ────────────────────────*/

/** 从全局层 tokens 拆出额外 token（排除默认字段）。 */
export function splitExtraTokenModes(tokens: Record<string, TokenModes>): ExtraTokenModes[] {
  const out: ExtraTokenModes[] = []
  for (const [key, value] of Object.entries(tokens)) {
    if (isDefaultField(key)) continue
    out.push({ key, value: { light: value.light, dark: value.dark } })
  }
  return out
}

/** 全局层额外 token 是否合法（key 合法且 light/dark 至少一个非空）。 */
export function isFilledExtraModes(e: ExtraTokenModes): boolean {
  return isValidExtraKey(e.key) && (e.value.light !== '' || e.value.dark !== '')
}

/** 把一组全局层额外 token 合入原 tokens（覆盖同名 key；空行忽略）。 */
export function mergeExtraTokenModes(
  base: Record<string, TokenModes>,
  extras: ExtraTokenModes[],
): Record<string, TokenModes> {
  const out = { ...base }
  for (const e of extras) {
    if (!isFilledExtraModes(e)) continue
    out[e.key] = { light: e.value.light, dark: e.value.dark }
  }
  return out
}
