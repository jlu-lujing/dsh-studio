/**
 * DshRuntime — spawn 抽象。
 *
 * 契约（见 docs/DESKTOP.md §6 / §10）：
 *   - dsh 只通过 CLI spawn + loopback HTTP(WebView) 交互；
 *   - 就绪信号 = stdout 的 "dsh web: http://127.0.0.1:<port>" 行；
 *   - 壳只读 runtime.json（版本/平台校验）+ spawn 契约 + stdout 就绪行。
 *
 * 支持两种运行时：
 *   方案 A（MVP，当前）：使用 Electron 内置 Node（ELECTRON_RUN_AS_NODE + --expose-internals）
 *   方案 B（目标态）：使用 dsh-runtime 自带的官方 Node 二进制（meta.bin）
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** 就绪行：`dsh web: http://127.0.0.1:<port>`(可带 ` (LAN: ...)` 后缀) */
export const READY_RE = /dsh web: (http:\/\/127\.0\.0\.1:[0-9]+\/?)/

export interface RuntimeMeta {
  schemaVersion?: number
  dshVersion?: string
  nodeVersion?: string
  platform?: string
  arch?: string
  /** 官方 Node 二进制相对路径（方案 B）；无则回退 Electron 内置 Node（方案 A） */
  bin?: string
  launch?: string[]
}

export interface SpawnResult {
  nodeBin: string
  dshBin: string
  exposeInternals: boolean
  dshHome: string
}

/** 壳管理的 dsh 进程句柄（external=true 表示复用宿主外部实例，退出不杀） */
export interface DshProcess {
  child: ChildProcess
  external: boolean
  url?: string
}

/**
 * 定位 dsh-runtime。优先级：
 *   1. 用户数据目录 <userData>/dsh-runtime/current （更新版）
 *   2. 出厂版 resources/dsh-runtime （随壳签名）
 *   3. 开发态回退：仓库内 apps/desktop/resources/dsh-runtime（未打包时方便真机验证）
 * 返回 null 表示未找到完整 runtime。
 */
export function resolveRuntime(userDataDir: string): { dir: string; meta: RuntimeMeta } | null {
  const candidates = [
    join(userDataDir, 'dsh-runtime', 'current'),
    join(process.resourcesPath ?? '', 'dsh-runtime'),
  ]
  // 打包后（defaultApp=false）不加开发回退；未打包时加仓库内 resources 目录。
  if (process.defaultApp !== false) {
    candidates.push(join(__dirname, '..', '..', 'resources', 'dsh-runtime'))
  }
  for (const dir of candidates) {
    const dshBin = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (!existsSync(dshBin)) continue
    let meta: RuntimeMeta = {}
    try {
      meta = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8'))
    } catch {
      meta = {}
    }
    return { dir, meta }
  }
  return null
}

/**
 * 组装 spawn 所需的 node / dsh bin / flags。
 *
 * 方案 B：runtime 自带 node（meta.bin）→ 用它的 node。
 * 方案 A：无自带 node → 用 Electron 内置 Node（ELECTRON_RUN_AS_NODE）。
 */
export function buildSpawn(runtimeDir: string, meta: RuntimeMeta, dshHome: string): SpawnResult {
  let nodeBin: string
  const exposeInternals = true
  if (meta.bin) {
    nodeBin = resolve(runtimeDir, meta.bin)
    if (!existsSync(nodeBin)) throw new Error(`runtime node missing: ${nodeBin}`)
  } else {
    // Electron 内置 Node：ELECTRON_RUN_AS_NODE 模式下 process.execPath 就是 electron 二进制，
    // 以 node 身份运行（实测必须带 --expose-internals，否则 HMR 服务 node-addon 崩溃）。
    nodeBin = process.execPath
  }
  const dshBin = resolve(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(dshBin)) throw new Error(`dsh bin missing: ${dshBin}`)
  return { nodeBin, dshBin, exposeInternals, dshHome }
}

/**
 * spawn dsh web --port 0，等待就绪行解析出真实 URL。
 * @returns 就绪即 resolve；超时 reject 且杀掉子进程。
 */
export function spawnWebAndWait(
  spawnBase: SpawnResult,
  opts: { timeoutMs?: number } = {},
): Promise<{ child: ChildProcess; url: string; log: string[] }> {
  const { timeoutMs = 30_000 } = opts
  const args: string[] = []
  if (spawnBase.exposeInternals) args.push('--expose-internals')
  args.push(spawnBase.dshBin, 'web', '--port', '0')

  const child = spawn(spawnBase.nodeBin, args, {
    env: { ...process.env, DSH_HOME: spawnBase.dshHome, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const logTail: string[] = []
  let url: string | null = null
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`dsh ready timeout (${timeoutMs}ms). output:\n${logTail.join('\n')}`))
    }, timeoutMs)

    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      logTail.push(text)
      const m = text.match(READY_RE)
      if (m && !url) {
        url = m[1]
        clearTimeout(timer)
        resolve({ child, url, log: logTail })
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('exit', (code) => {
      if (!url) {
        clearTimeout(timer)
        reject(new Error(`dsh exited before ready (code=${code}). output:\n${logTail.join('\n')}`))
      }
    })
    child.on('error', (err) => {
      if (!url) {
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

/** 优雅停止 dsh 子进程：SIGINT → 5s → SIGKILL。 */
export function stopWeb(child: ChildProcess): void {
  if (!child || child.killed || child.exitCode !== null) return
  try { child.kill('SIGINT') } catch { /* 已退出 */ }
  const t = setTimeout(() => {
    try { child.kill('SIGKILL') } catch { /* 已退出 */ }
  }, 5000)
  t.unref()
}
