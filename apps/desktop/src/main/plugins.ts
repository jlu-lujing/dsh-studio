/**
 * FamilyPlugins — 桌面端「自动装 dsh-studio 全家桶」。
 *
 * 产品定位（README 双主线）：桌面客户端和 npm 插件包共享同一套 dsh-studio 全家桶
 * 逻辑。桌面端首次启动时应保证用户 web profile 里已装 dsh-studio 全家桶，做到
 * 「开箱即用」——否则用户打开看到的只有 DSH 本体，没有 dsh-studio 的五大功能。
 *
 * 实现：
 *   - 检测：读 <profile>/package.json 的 dependencies 是否含 dsh-studio；
 *   - 安装：spawn dsh 的 `plugin --profile <name> add -w dsh-studio`（与用户手动
 *     命令完全一致，dsh-studio 会带出其全部 feature 子包依赖 + 内置满血模式 preset）；
 *   - 该命令内部 forward 给系统 pnpm（dsh-runtime 不带 pnpm，需 PATH 里有 pnpm）；
 *   - 自动装是「尽力而为」：失败仅记录日志，不阻塞 dsh 启动、不弹错误框。
 */

import { readFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'

/** 起装全家桶的最小超时（秒）。pnpm 首次 install 可能较慢。 */
const INSTALL_TIMEOUT_MS = 120_000

/** DSH Studio 单包（7 合 1：聚合 + 六个功能）。 */
const FAMILY_PACKAGES = ['dsh-studio']

export interface FamilyCheckOptions {
  /** 要装到的 profile 名（默认 web）。 */
  profile: string
  /** dshHome（~/.dsh 或 DSH_HOME），用于给子进程注入 DSH_HOME。 */
  dshHome?: string
  /** dshHome 下 profiles 目录的绝对路径，通常 <dshHome>/profiles。 */
  profilesDir: string
  /** dsh-runtime 目录：若其内置了 dsh-studio 全家桶，则优先本地 link 不拉 npm。 */
  runtimeDir?: string
  /** 记录日志的回调（桌面端 appendLog）。 */
  log?: (line: string) => void
}

/** runtime 是否内置了 dsh-studio 全家桶（package.json 里记录 family，且实际有包）。 */
export function familyBundledInRuntime(runtimeDir: string | undefined): boolean {
  if (!runtimeDir) return false
  try {
    const id = join(runtimeDir, 'node_modules', 'dsh-studio', 'package.json')
    if (!existsSync(id)) return false
    // 校验运行时 metadata 也声明了 family（版本锁定标记）
    const meta = JSON.parse(readFileSync(join(runtimeDir, 'runtime.json'), 'utf8')) as { family?: Record<string, string> }
    return !!meta.family && Object.keys(meta.family).length >= 6
  } catch {
    return false
  }
}

/** 读取某 profile 的 package.json 里的 dependencies（不存在视为空）。 */
function profileDeps(profilesDir: string, profile: string): Record<string, string> {
  try {
    const raw = readFileSync(`${profilesDir}/${profile}/package.json`, 'utf8')
    return (JSON.parse(raw) as { dependencies?: Record<string, string> }).dependencies ?? {}
  } catch {
    return {}
  }
}

/** 该 profile 是否已装 dsh-studio 全家桶（以 dependencies 里有 dsh-studio 为准）。 */
export function familyInstalled(opts: FamilyCheckOptions): boolean {
  return 'dsh-studio' in profileDeps(opts.profilesDir, opts.profile)
}

/**
 * spawn dsh 的 `plugin --profile <name> add -w dsh-studio` 把全家桶装进指定 profile。
 * PATH 里注入系统 pnpm 所在目录（dsh plugin 内部会 spawnSync("pnpm")）。
 *
 * @returns 安装成功与否。
 */
export async function installFamilyTo(
  nodeBin: string,
  dshBin: string,
  opts: FamilyCheckOptions,
): Promise<boolean> {
  const { profile, log } = opts
  const line = (s: string) => { try { log?.(s) } catch { /* 忽略 */ } }

  // 找系统 pnpm 的目录，注入 PATH（优先 PATH 里已有的，兜底用 which）
  let pnpmDir = ''
  try {
    const { execFileSync } = await import('node:child_process')
    const which = execFileSync('which', ['pnpm'], { encoding: 'utf8' }).trim()
    pnpmDir = which ? dirname(which) : ''
  } catch {
    pnpmDir = ''
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: opts.dshHome ?? process.env.DSH_HOME ?? '',
    ELECTRON_RUN_AS_NODE: '1',
  }
  if (pnpmDir) {
    // 把 pnpm 目录放到 PATH 最前，确保 spawnSync("pnpm") 命中
    env.PATH = `${pnpmDir}:${env.PATH ? env.PATH : ''}`
  }

  const args = [dshBin, 'plugin', '--profile', profile, 'add', '-w', 'dsh-studio']
  line(`family: installing dsh-studio into profile "${profile}" via dsh plugin (node=${nodeBin})`)

  return await new Promise<boolean>((resolve) => {
    const child = spawn(nodeBin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* 已退出 */ }
      line(`family: install timed out after ${INSTALL_TIMEOUT_MS}ms`)
      resolve(false)
    }, INSTALL_TIMEOUT_MS)

    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      out += text
      // 只记关键行，避免刷屏
      for (const ln of text.split('\n')) {
        const t = ln.trim()
        if (t && /(Progress|Done|added|removed|dir:|dsh-studio|error|Error|ERR_)/.test(t)) {
          line(`family: ${t}`)
        }
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', (err) => {
      clearTimeout(timer)
      line(`family: spawn error: ${err.message}`)
      resolve(false)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      const ok = code === 0
      line(`family: install ${ok ? 'succeeded' : `failed (code=${code})`}`)
      // 失败时输出尾部日志便于排查
      if (!ok) {
        const tail = out.trim().split('\n').slice(-8).join(' | ')
        if (tail) line(`family: last output: ${tail}`)
      }
      resolve(ok)
    })
  })
}

/** 便捷入口：未装则发起安装，返回是否已就绪（装好或已存在）。 */
export function ensureFamilyInstalled(nodeBin: string, dshBin: string, opts: FamilyCheckOptions): void {
  if (process.env.DSH_DESKTOP_SKIP_FAMILY === '1') {
    opts.log?.(`family: skipped by DSH_DESKTOP_SKIP_FAMILY=1`)
    return
  }
  if (familyInstalled(opts)) {
    opts.log?.(`family: dsh-studio already installed in profile "${opts.profile}"`)
    return
  }
  // 后台安装，不阻塞 boot
  const useLocal = familyBundledInRuntime(opts.runtimeDir)
  const job = useLocal
    ? installFamilyFromRuntime(opts.runtimeDir!, opts)
    : installFamilyTo(nodeBin, dshBin, opts)
  void job.then((ok) => {
    opts.log?.(`family: ${ok ? 'ready' : 'failed — user can install manually via dsh plugin --profile ${opts.profile} add -w dsh-studio'}`)
  })
}

/**
 * 从 runtime 内置的全家桶装配 profile：把 runtime/node_modules/dsh-studio* 用
 * symlink/junction 链到 profile 的 node_modules，并更新 profile package.json。
 * 全程本地、离线、不走 npm；dsh 的 cordis loader 解析 node_modules 即可加载。
 */
export async function installFamilyFromRuntime(
  runtimeDir: string,
  opts: FamilyCheckOptions,
): Promise<boolean> {
  const { profile, profilesDir, log } = opts
  const line = (s: string) => { try { log?.(s) } catch { /* 忽略 */ } }
  try {
    const profileDir = join(profilesDir, profile)
    if (!existsSync(profileDir)) {
      line(`family: profile "${profile}" dir missing at ${profileDir}`)
      return false
    }
    const nmDir = join(profileDir, 'node_modules')
    mkdirSync(nmDir, { recursive: true })

    // 1) 列出 runtime 内置的全家桶
    const bundled: string[] = []
    for (const name of FAMILY_PACKAGES) {
      const from = join(runtimeDir, 'node_modules', name)
      if (existsSync(from)) bundled.push(name)
    }
    if (bundled.length === 0) {
      line(`family: runtime has no bundled dsh-studio family at ${join(runtimeDir, 'node_modules')}`)
      return false
    }

    // 2) 在 profile/node_modules 里建 symlink/junction（幂等：已存在则跳过）
    const linked: string[] = []
    for (const name of bundled) {
      const target = join(runtimeDir, 'node_modules', name)
      const linkPath = join(nmDir, name)
      if (existsSync(linkPath)) continue
      symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
      linked.push(name)
    }
    if (linked.length === 0) {
      line(`family: all bundled packages already linked in ${nmDir}`)
      return true
    }

    // 3) 更新 profile/package.json 的 dependencies（记录来源 + 版本），幂等
    const pkgPath = join(profileDir, 'package.json')
    const pkg = JSON.parse(existsSync(pkgPath) ? readFileSync(pkgPath, 'utf8') : '{}')
    const deps: Record<string, string> = pkg.dependencies && typeof pkg.dependencies === 'object'
      ? pkg.dependencies
      : {}
    for (const name of bundled) {
      try {
        const meta = JSON.parse(readFileSync(join(runtimeDir, 'node_modules', name, 'package.json'), 'utf8')) as { version?: string }
        deps[name] = meta.version ? `^${meta.version}` : `file:${join(runtimeDir, 'node_modules', name)}`
      } catch {
        deps[name] = `file:${join(runtimeDir, 'node_modules', name)}`
      }
    }
    if (!pkg.bundles) pkg.bundles = {}
    if (!pkg.bundles.includes?.('dsh-studio')) {
      pkg.bundles = Array.isArray(pkg.bundles) ? [...new Set([...pkg.bundles, 'dsh-studio'])] : ['dsh-studio']
    }
    pkg.dependencies = deps
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

    line(`family: linked ${linked.length}/${bundled.length} bundled packages into ${profile}`)
    return true
  } catch (err) {
    line(`family: runtime link failed: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}
