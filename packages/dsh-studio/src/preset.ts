/**
 * dsh-studio 内置的 agent preset 导入/删除管理器。
 *
 * 预设算法与文件集合并非本仓库原创——社区项目
 * xiaobright/dsh-anchored-standard（MIT，见 `refs/dsh-anchored-standard/`）
 * 提供了「Minimal 工具对引导 → 首次晋升后开放完整工具」的二阶段算法与 preset
 * 文件。dsh-studio 只负责把这些 preset 文件打包分发，并对用户的
 * `~/.dsh/.agent-presets/<id>` 目录做导入(install)/删除(uninstall)。
 *
 * 目前内置两个模式（preset/ 下每模式一个子目录）：
 *   - boost-mode  ：Boost Mode —— 纯 dsh-anchored-standard（二阶段 + on-demand discovery）
 *   - jspace-mode ：J-Space Mode —— 标准模式 + preset 内联 J-Space Cognitive Suite
 *     （persona 提示可用 j-space；inline-jspace.mjs 把它注册进 ctx.skills 供
 *       skill_search / skill_load 发现，不触碰用户 ~/.dsh/skills）
 *
 * 本模块纯粹文件 I/O，无 Cordis 依赖，可独立单测。安装目录已存在时绝不覆盖
 * （保留用户修改）；删除即递归移除目标目录。
 */

import { readdirSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 内置 preset 注册表：id → preset/ 下子目录名。 */
export const PRESETS = {
  'boost-mode': 'boost-mode',
  'jspace-mode': 'jspace-mode',
} as const

export type PresetId = keyof typeof PRESETS

/** 向后兼容：默认 id（与既有 store.ts / 状态文件一致）。 */
export const PRESET_ID: PresetId = 'boost-mode'

/** Files that make a directory a complete DSH agent preset. */
const REQUIRED_FILES = ['agent.cordis.yml', 'preset.yml']

/** 返回打包在 dsh-studio 内的 preset 源目录（绝对路径，preset/ 根）。 */
export function presetSourceRoot(): string {
  return fileURLToPath(new URL('../preset/', import.meta.url))
}

/** 某 id 的 preset 源子目录（preset/<id>/）。 */
export function presetSourceDir(id: PresetId = PRESET_ID): string {
  return join(presetSourceRoot(), PRESETS[id] ?? id)
}

/** 解析 DSH home（配置根，非 `.agent-presets` 目录）。 */
export function resolveDshHome(home?: string): string {
  return home ?? process.env.DSH_HOME ?? `${process.env.HOME ?? '.'}/.dsh`
}

/** 某 preset 在用户 preset 根下的目标目录绝对路径。 */
export function presetTargetDir(id: PresetId = PRESET_ID, home?: string): string {
  return join(resolveDshHome(home), '.agent-presets', id)
}

function isCompletePreset(dir: string): boolean {
  return REQUIRED_FILES.every((file) => existsSync(join(dir, file)))
}

/** 某 preset 是否已安装到默认 home。 */
export function isInstalled(options: { id?: PresetId; home?: string; targetDir?: string } = {}): boolean {
  return existsSync(options.targetDir ?? presetTargetDir(options.id ?? PRESET_ID, options.home))
}

/**
 * 删除某 preset（目标不存在时无操作）。
 * @returns 是否成功删除。
 */
export function uninstallPreset(options: { id?: PresetId; home?: string; targetDir?: string } = {}): { target: string; removed: boolean } {
  const target = options.targetDir ?? presetTargetDir(options.id ?? PRESET_ID, options.home)
  if (!existsSync(target)) return { target, removed: false }
  rmSync(target, { recursive: true, force: true })
  return { target, removed: true }
}

/** 从源目录复制全部条目到目标。 */
function copyTree(source: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    cpSync(join(source, entry.name), join(dest, entry.name), { recursive: true, dereference: true })
  }
}

/**
 * 导入（安装）某 preset。幂等且非破坏性。
 * @returns 安装结果。
 */
export function installPreset(options: { id?: PresetId; home?: string; sourceDir?: string; targetDir?: string } = {}): {
  target: string
  installed: boolean
  skipped?: 'already-installed' | 'existing-target'
} {
  const id = options.id ?? PRESET_ID
  const source = options.sourceDir ?? presetSourceDir(id)
  const target = options.targetDir ?? presetTargetDir(id, options.home)
  const parent = dirname(target)

  mkdirSync(parent, { recursive: true })

  let presetResult: { installed: boolean; skipped?: 'already-installed' | 'existing-target' }

  if (existsSync(target)) {
    presetResult = {
      installed: false,
      skipped: isCompletePreset(target) ? 'already-installed' : 'existing-target',
    }
  } else {
    const staging = join(parent, `.${id}.dsh-studio-install`)
    rmSync(staging, { recursive: true, force: true })
    try {
      copyTree(source, staging)
      if (!isCompletePreset(staging)) {
        throw new Error(`bundled preset "${id}" source is incomplete: ${source}`)
      }
      renameSync(staging, target)
      presetResult = { installed: true }
    } catch (error) {
      rmSync(staging, { recursive: true, force: true })
      throw error
    }
  }

  return { target, ...presetResult }
}
