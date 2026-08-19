/**
 * inline-jspace — 把 preset 内联的 j-space skill 注册进 ctx.skills。
 *
 * J-Space Mode 把 J-Space Cognitive Suite 直接内联在 preset 目录的
 * `j-space/`（而非 `~/.dsh/skills`）。为了让 `skill_search` / `skill_load`
 * 能发现并加载它，本插件用 `ctx.skills.registerProvider` 注册一个内存级
 * provider，通过 `import.meta.url` 定位自身（preset 目录），再指向
 * `./j-space/SKILL.md`。
 *
 * 这样无论 preset 被装到哪个 `~/.dsh/.agent-presets/<id>/`，j-space skill
 * 都能被发现；不动用户的 `~/.dsh/skills`，完全随 preset 内联。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name（loader 诊断用）。 */
export const name = 'inline-jspace'

/** 需要 skills 服务（skill-search.mjs 的 skill_search/skill_load 依赖它）。 */
export const inject = ['skills']

/** preset 内 j-space 目录（相对本插件所在目录）。 */
const JSPACE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'j-space')
const SKILL_FILE = join(JSPACE_DIR, 'SKILL.md')

/** 极简 YAML frontmatter 解析（只要 name/description/whenToUse 标量）。 */
function parseFrontmatter(raw) {
  const meta = {}
  const body = raw.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/, (_, fm) => {
    for (const line of fm.split(/\r?\n/)) {
      const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
      if (!m) continue
      let value = m[2].trim()
      // 剥掉单/双引号（含跨行值只取首行——J-Space 的 description 是单行）。
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      meta[m[1]] = value
    }
    return ''
  })
  return { meta, body }
}

const parsed = parseFrontmatter(readFileSync(SKILL_FILE, 'utf8'))

/** 单一 skill candidate。 */
function candidate() {
  return {
    name: 'j-space',
    description: parsed.meta.description ?? 'J-Space cognitive control protocol.',
    whenToUse: parsed.meta.whenToUse,
    invocation: {},
    source: 'inline',
    provider: 'inline-jspace',
    resourceBase: { path: JSPACE_DIR, relative: ['modules', 'references'] },
    rank: 10,
    locator: { name: 'j-space' },
    path: SKILL_FILE,
    metadata: parsed.meta,
  }
}

export function apply(ctx) {
  return ctx.skills.registerProvider({
    name: 'inline-jspace',
    async list() {
      return [candidate()]
    },
    async get(c) {
      if (c?.locator?.name !== 'j-space') return undefined
      return {
        ...candidate(),
        content: parsed.body,
      }
    },
  })
}
