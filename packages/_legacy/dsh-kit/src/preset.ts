/**
 * dsh-kit 内置的 agent preset 导入/删除管理器。
 *
 * 该 preset 的算法与文件集合并非本仓库原创——社区项目
 * xiaobright/dsh-anchored-standard（MIT，含 DeepSeek 声明，见 README「借鉴」）
 * 提供了「Minimal 工具对引导 → 首次晋升后开放完整工具」的二阶段算法与 preset
 * 文件。dsh-kit 只负责把这些 preset 文件打包分发，并对用户的
 * `~/.dsh/.agent-presets/boost-mode` 目录做导入(install)/删除(uninstall)。
 *
 * 同时管理随 preset 一起分发的 **j-space 认知协议 skill**：
 * 安装 preset 时把内置的 `j-space/` 目录装入 `~/.dsh/skills/j-space/`，让它在
 * dsh 的 skill 目录里可被 `skill_search` / `skill_load` 发现与按需加载
 * （遵循 J-Space 官方「选择性加载」设计，不注入每轮上下文）。
 *
 * 本模块纯粹文件 I/O，无 Cordis 依赖，可独立单测。安装目录已存在时绝不覆盖
 *（保留用户修改）；删除即递归移除目标目录。
 */

import { readdirSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis row id / 功能 id（保持与既有 dsh-kit store.ts / 状态文件一致）。 */
export const PRESET_ID = 'boost-mode'

/** 内置的 j-space skill 目录名（位于 preset 源根下，也作为 skill 的 name 根）。 */
export const JSPACE_SKILL_ID = 'j-space'

/** Files that make a directory a complete DSH agent preset. */
const REQUIRED_FILES = ['agent.cordis.yml', 'preset.yml']

/** 返回打包在 dsh-kit 内的 preset 源目录（绝对路径）。 */
export function presetSourceDir(): string {
  return fileURLToPath(new URL('../preset/', import.meta.url))
}

/** 解析 DSH home（配置根，非 `.agent-presets` 目录）。 */
export function resolveDshHome(home?: string): string {
  return home ?? process.env.DSH_HOME ?? `${process.env.HOME ?? '.'}/.dsh`
}

/** 该 preset 在用户 preset 根下的目标目录绝对路径。 */
export function presetTargetDir(home?: string): string {
  return join(resolveDshHome(home), '.agent-presets', PRESET_ID)
}

/** 内置 j-space skill 的源目录（preset 源根下的 `j-space/`）。 */
export function jspaceSkillSourceDir(): string {
  return join(presetSourceDir(), JSPACE_SKILL_ID)
}

/** 该 j-space skill 在用户 skill 根下的目标目录绝对路径（`~/.dsh/skills/j-space`）。 */
export function jspaceSkillTargetDir(home?: string): string {
  return join(resolveDshHome(home), 'skills', JSPACE_SKILL_ID)
}

function isCompletePreset(dir: string): boolean {
  return REQUIRED_FILES.every((file) => existsSync(join(dir, file)))
}

/** 该 preset 是否已安装到默认 home。 */
export function isInstalled(options: { home?: string; targetDir?: string } = {}): boolean {
  return existsSync(options.targetDir ?? presetTargetDir(options.home))
}

/** 该 j-space skill 是否已安装（~/.dsh/skills/j-space 存在）。 */
export function isJspaceSkillInstalled(options: { home?: string; targetDir?: string } = {}): boolean {
  return existsSync(options.targetDir ?? jspaceSkillTargetDir(options.home))
}

/**
 * 删除该 preset（目标不存在时无操作）。
 * @returns 是否成功删除。
 */
export function uninstallPreset(options: { home?: string; targetDir?: string } = {}): { target: string; removed: boolean } {
  const target = options.targetDir ?? presetTargetDir(options.home)
  if (!existsSync(target)) return { target, removed: false }
  rmSync(target, { recursive: true, force: true })
  return { target, removed: true }
}

/**
 * 删除内置 j-space skill（目标不存在时无操作）。
 * @returns 是否成功删除。
 */
export function uninstallJspaceSkill(options: { home?: string; targetDir?: string } = {}): { target: string; removed: boolean } {
  const target = options.targetDir ?? jspaceSkillTargetDir(options.home)
  if (!existsSync(target)) return { target, removed: false }
  rmSync(target, { recursive: true, force: true })
  return { target, removed: true }
}

/** 从源目录复制除排除集外的全部条目到目标（staging 用；cpSync 无排除能力）。 */
function copyTreeExcept(source: string, dest: string, excludeNames: ReadonlySet<string>): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (excludeNames.has(entry.name)) continue
    cpSync(join(source, entry.name), join(dest, entry.name), { recursive: true, dereference: true })
  }
}

/**
 * 导入（安装）该 preset。幂等且非破坏性。除 preset 本体外，还会把内置的
 * j-space skill 一并装入 `~/.dsh/skills/j-space/`（同样幂等、非破坏）。
 * @returns 安装结果（含 j-space skill 的状态）。
 */
export function installPreset(options: { home?: string; sourceDir?: string; targetDir?: string } = {}): {
  target: string
  installed: boolean
  skipped?: 'already-installed' | 'existing-target'
  jspace?: { target: string; installed: boolean; skipped?: 'already-installed' }
} {
  const source = options.sourceDir ?? presetSourceDir()
  const target = options.targetDir ?? presetTargetDir(options.home)
  const home = options.home
  const parent = dirname(target)

  mkdirSync(parent, { recursive: true })

  let presetResult: { installed: boolean; skipped?: 'already-installed' | 'existing-target' }

  if (existsSync(target)) {
    presetResult = {
      installed: false,
      skipped: isCompletePreset(target) ? 'already-installed' : 'existing-target',
    }
  } else {
    const staging = join(parent, `.${PRESET_ID}.dsh-kit-install`)
    rmSync(staging, { recursive: true, force: true })
    try {
      // 排除 j-space/：它属于 skill，不属于 agent-presets 目录本身。
      copyTreeExcept(source, staging, new Set([JSPACE_SKILL_ID]))
      if (!isCompletePreset(staging)) {
        throw new Error(`bundled preset source is incomplete: ${source}`)
      }
      renameSync(staging, target)
      presetResult = { installed: true }
    } catch (error) {
      rmSync(staging, { recursive: true, force: true })
      throw error
    }
  }

  // j-space skill：与 preset 一起安装到 ~/.dsh/skills/j-space（非破坏）。
  const jspace = partialInstallJspaceSkill({ home })

  return { target, ...presetResult, jspace }
}

/** 独立安装 j-space skill（不依赖 preset 本体）。 */
export function installJspaceSkill(options: { home?: string; sourceDir?: string; targetDir?: string } = {}): {
  target: string
  installed: boolean
  skipped?: 'already-installed'
} {
  return partialInstallJspaceSkill(options)
}

function partialInstallJspaceSkill(options: { home?: string; sourceDir?: string; targetDir?: string } = {}): {
  target: string
  installed: boolean
  skipped?: 'already-installed'
} {
  const source = options.sourceDir ?? jspaceSkillSourceDir()
  const target = options.targetDir ?? jspaceSkillTargetDir(options.home)
  const parent = dirname(target)

  mkdirSync(parent, { recursive: true })

  if (existsSync(target)) {
    return { target, installed: false, skipped: 'already-installed' }
  }

  const staging = join(parent, `.${JSPACE_SKILL_ID}.dsh-kit-install`)
  rmSync(staging, { recursive: true, force: true })
  try {
    // j-space 目录自身需要完整保留（含 modules/references/scripts 相对路径）。
    cpSync(source, staging, { recursive: true, dereference: true })
    if (!existsSync(join(staging, 'SKILL.md'))) {
      throw new Error(`bundled j-space skill source is incomplete: ${source}`)
    }
    renameSync(staging, target)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }

  return { target, installed: true }
}
