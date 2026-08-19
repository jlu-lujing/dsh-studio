/**
 * DshRuntimeUpdater — dsh-runtime 独立更新链路（docs/DESKTOP.md §7）。
 *
 * 流程：
 *   fetchFeed → downloadAndVerify(sha512) → extractRuntime(纯 JS 解压到 next/)
 *   → smokeRuntime(冒烟) → stopWeb(停旧) → atomicSwitch(current↔previous)
 *   → restartWeb(重启) → 失败自动回滚 previous。
 *
 * 设计要点：
 *   - 发布物为 gzip 压缩的 tar（`tar.gz`），本模块用 Node 内置 zlib + tar-stream
 *     纯 JS 解压，**无外部二进制依赖**，跨平台（含 Windows，无需系统 tar/zstd）。
 *   - 解压到 <userData>/dsh-runtime/next/ 后原子重命名切换，不碰已签名 App 包。
 *   - 与壳的 spawn 契约一致：只读 runtime.json + CLI + stdout 就绪行。
 */

import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, readFileSync, renameSync } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { join } from 'node:path'
import * as tar from 'tar-stream'
import { buildSpawn, spawnWebAndWait, stopWeb, type RuntimeMeta, type DshProcess } from './runtime'

/** 更新 feed 的单条发布物描述。字段见 DESKTOP §7 契约。 */
export interface UpdateFeed {
  schemaVersion: number
  dshVersion: string
  platform: string
  arch: string
  /** 下载地址（http/https 或 file: 本地路径，便于离线测试） */
  url: string
  /** sha512 十六进制（小写），用于下载校验 */
  sha512: string
  /** 兼容此更新的最小壳版本（semver 字符串）；壳低于此则不应用 */
  minDesktopVersion?: string
  changelog?: string
  /** 压缩格式；默认 tar.gz（纯 JS 可解）。保留 zstd-tar 字段未实现依赖 */
  format?: 'tar.gz'
}

export interface UpdateResult {
  applied: boolean
  /** 应用后的运行时目录（current 或回滚后的 previous，二选一） */
  activeDir: string
  meta: RuntimeMeta
  previousDir?: string
}

/** 事件回调，供 UI/日志展示阶段进展 */
export type UpdateListener = (stage: string, detail?: string) => void

/**
 * 拉取并解析更新 feed。electron net 模块走系统代理，支持 file: 便于本地测试。
 */
export async function fetchFeed(feedUrl: string): Promise<UpdateFeed> {
  const buf = await readUrl(feedUrl)
  const parsed = JSON.parse(buf.toString('utf8')) as UpdateFeed
  if (typeof parsed.schemaVersion !== 'number' || typeof parsed.url !== 'string') {
    throw new Error(`feed 格式无效: ${feedUrl}`)
  }
  return parsed
}

/**
 * 下载发布物并校验 sha512，返回暂存文件路径。
 * 下载目标写到 <userData>/dsh-runtime/.staging/ 下。
 */
export async function downloadAndVerify(
  userDataDir: string,
  feed: UpdateFeed,
  listener?: UpdateListener,
): Promise<string> {
  const stagingDir = join(userDataDir, 'dsh-runtime', '.staging')
  mkdirSync(stagingDir, { recursive: true })
  const tmp = join(stagingDir, `download-${randomBytes(6).toString('hex')}.tar.gz`)
  const data = await readUrl(feed.url)
  // 边写边算 sha512
  const hash = createHash('sha512')
  hash.update(data)
  const got = hash.digest('hex')
  if (!feed.sha512 || got.toLowerCase() !== feed.sha512.toLowerCase()) {
    const err = `sha512 校验失败: 期望 ${feed.sha512?.slice(0, 16)}… 实际 ${got.slice(0, 16)}…`
    listener?.('校验失败', err)
    throw new Error(err)
  }
  await writeAll(tmp, data)
  listener?.('下载完成', `sha512 校验通过 (${data.length} bytes)`)
  return tmp
}

/**
 * 纯 JS 解压 tar.gz 到 destDir（即 next/）。用 Node zlib gunzip + tar-stream 逐文件落地。
 */
export async function extractRuntime(zipPath: string, destDir: string, listener?: UpdateListener): Promise<void> {
  rmSync(destDir, { recursive: true, force: true })
  mkdirSync(destDir, { recursive: true })
  await extractTo(zipPath, destDir)

  // 校验：必须有 node_modules/@deepseek-ai/dsh/lib/bin.js
  const dshBin = join(destDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(dshBin)) {
    throw new Error(`解压后缺少 dsh bin: ${dshBin}`)
  }
  listener?.('解压完成', destDir)
}

/** 逐 entry 把 tar.gz 解压到 destRoot（用 pipe 到每个 head 的 writable）。 */
async function extractTo(zipPath: string, destRoot: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const extract = tar.extract()
    const gunzip = createGunzip()
    extract.on('entry', (header, stream, next) => {
      const target = join(destRoot, header.name)
      if (header.type === 'directory') {
        mkdirSync(target, { recursive: true })
        next()
        return
      }
      if (header.type === 'file') {
        mkdirSync(join(target, '..'), { recursive: true })
        const out = createWriteStream(target)
        stream.on('end', () => { out.end(); next() })
        stream.on('error', (e) => { out.destroy(e); next() })
        stream.pipe(out)
        return
      }
      stream.resume() // 其它类型（symlink 等）跳过
      next()
    })
    extract.on('finish', () => resolve())
    extract.on('error', reject)
    createReadStream(zipPath).pipe(gunzip).pipe(extract)
  })
}

/**
 * 冒烟验证一个 runtime 目录：node --version + web --dump-config 均需成功。
 * 返回解析出的 runtime.json meta。
 */
export async function smokeRuntime(runtimeDir: string, dshHome: string, listener?: UpdateListener): Promise<RuntimeMeta> {
  let meta: RuntimeMeta = {}
  try { meta = JSON.parse(readFileSync(join(runtimeDir, 'runtime.json'), 'utf8')) } catch { /* 空 */ }
  const spawnBase = buildSpawn(runtimeDir, meta, dshHome)
  const vOut = await execCapture(spawnBase.nodeBin, ['--version'])
  listener?.('冒烟 node', vOut.trim())
  // web --dump-config 只探配置，不常驻；--port 无关紧要，用超时兜底
  const cfgOut = await execCapture(spawnBase.nodeBin, ['--expose-internals', spawnBase.dshBin, 'web', '--dump-config'])
  listener?.('冒烟 web --dump-config', cfgOut.trim().slice(0, 200))
  return meta
}

/**
 * 原子切换：把 current 改名为 previous，next 改为 current。
 * 若已被 previous 占据则先清掉旧 previous。失败时可由调用方回滚。
 */
export function atomicSwitch(userDataDir: string, listener?: UpdateListener): { currentDir: string; previousDir: string } {
  const base = join(userDataDir, 'dsh-runtime')
  const current = join(base, 'current')
  const previous = join(base, 'previous')
  const next = join(base, 'next')
  const previousOld = join(base, 'previous-old')
  const currentOld = join(base, 'current-old')

  if (!existsSync(next)) throw new Error(`atomicSwitch: 缺少 next/ 目录 ${next}`)
  if (existsSync(current)) {
    // 现 current → previous（previous 若有则先移到 previous-old 兜底）
    if (existsSync(previous)) rmSync(previous, { recursive: true, force: true })
    renameSync(current, previous)
  }
  // 若之前已有 previous 且 current 不存在（首次或回滚场景），保留
  renameSync(next, current)
  // 清理 current-old/previous-old（若之前崩溃留下的）
  rmSync(previousOld, { recursive: true, force: true })
  rmSync(currentOld, { recursive: true, force: true })
  listener?.('切换完成', `current ← ${current}`)
  return { currentDir: current, previousDir: previous }
}

/** 回滚：把 previous 移回 current；若无 previous 则抛错。 */
export function rollback(userDataDir: string, listener?: UpdateListener): string {
  const base = join(userDataDir, 'dsh-runtime')
  const current = join(base, 'current')
  const previous = join(base, 'previous')
  const next = join(base, 'next')
  if (!existsSync(previous)) throw new Error('rollback: 无 previous 可回滚')
  if (existsSync(current)) rmSync(current, { recursive: true, force: true })
  if (existsSync(next)) rmSync(next, { recursive: true, force: true })
  renameSync(previous, current)
  listener?.('回滚完成', current)
  return current
}

/**
 * 编排一次更新：下载→校验→解压→冒烟→停旧→切换→重启→失败回滚。
 * @returns 新启用的 dsh 进程与 URL；供壳替换 managed。
 */
export async function applyUpdate(opts: {
  userDataDir: string
  feedUrl: string
  dshHome: string
  current: { dir: string; child?: ChildProcessLike }
  desktopVersion: string
  listener?: UpdateListener
}): Promise<{ managed: DshProcess; url: string }> {
  const { userDataDir, feedUrl, dshHome, desktopVersion, listener } = opts
  const emit = (stage: string, d = '') => listener?.(stage, d)

  const feed = await fetchFeed(feedUrl)
  if (feed.minDesktopVersion && semverLt(desktopVersion, feed.minDesktopVersion)) {
    throw new Error(
      `壳版本过低：需要 >= ${feed.minDesktopVersion}，当前 ${desktopVersion}。请先升级桌面壳。`,
    )
  }
  if (feed.platform && feed.platform !== process.platform) {
    throw new Error(`feed 平台 ${feed.platform} 与当前 ${process.platform} 不符`)
  }
  if (feed.arch && feed.arch !== process.arch) {
    throw new Error(`feed 架构 ${feed.arch} 与当前 ${process.arch} 不符`)
  }

  const base = join(userDataDir, 'dsh-runtime')
  const nextDir = join(base, 'next')

  emit('开始更新', `${feed.dshVersion} @ ${feed.arch}/${feed.platform}`)

  // 1) 下载 + 校验
  const zipPath = await downloadAndVerify(userDataDir, feed, emit)
  // 2) 解压到 next/
  await extractRuntime(zipPath, nextDir, emit)
  // 3) 冒烟验证 next
  await smokeRuntime(nextDir, dshHome, emit)

  // 4) 停旧 dsh（external 不杀）
  if (opts.current.child && !opts.current.child.killed) {
    emit('停止旧实例')
    stopWeb(opts.current.child)
    // 等待进程退出（最长 6s）
    await waitExit(opts.current.child, 6_000)
  }

  // 5) 原子切换 next→current，旧 current→previous
  atomicSwitch(userDataDir, emit)

  // 6) 重启 dsh 用新 current
  try {
    emit('启动新实例')
    const meta = JSON.parse(readFileSync(join(base, 'current', 'runtime.json'), 'utf8')) as RuntimeMeta
    const spawnBase = buildSpawn(join(base, 'current'), meta, dshHome)
    const { child, url } = await spawnWebAndWait(spawnBase, { timeoutMs: 30_000 })
    emit('新实例就绪', url)
    return { managed: { child, external: false, url }, url }
  } catch (err) {
    emit('启动失败，回滚', err instanceof Error ? err.message : String(err))
    try {
      rollback(userDataDir, emit)
      // 回滚后再起一次 previous（即原来的 current）
      const meta = JSON.parse(readFileSync(join(base, 'current', 'runtime.json'), 'utf8')) as RuntimeMeta
      const spawnBase = buildSpawn(join(base, 'current'), meta, dshHome)
      const { child, url } = await spawnWebAndWait(spawnBase, { timeoutMs: 30_000 })
      return { managed: { child, external: false, url }, url }
    } catch (rollbackErr) {
      throw new Error(`新 runtime 启动失败且回滚也失败: ${rollbackErr instanceof Error ? rollbackErr.message : rollbackErr}`)
    }
  }
}

/* ---------------------------- 内部工具 ---------------------------- */

type ChildProcessLike = import('node:child_process').ChildProcess | null

/**
 * 读取 URL（http/https 用全局 fetch；file: 用本地 fs）。
 * 返回完整 Buffer。用全局 fetch（Node 18+/Electron main 均内置），零 electron
 * 依赖，Node 环境亦可单测。
 */
async function readUrl(url: string): Promise<Buffer> {
  if (url.startsWith('file:')) {
    const path = url.replace(/^file:\/\//, '').replace(/^file:/, '')
    return readFileSync(decodeURIComponent(path))
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status} ${url}`)
    const data = new Uint8Array(await resp.arrayBuffer())
    return Buffer.from(data)
  }
  throw new Error(`不支持的 URL scheme: ${url}`)
}

async function writeAll(path: string, data: Buffer): Promise<void> {
  const stream = createWriteStream(path)
  await new Promise<void>((resolve, reject) => {
    stream.on('error', reject)
    stream.end(data, () => resolve())
  })
}

/** 执行一条命令并捕获 stdout（含 stderr），超时抛错。 */
function execCapture(bin: string, args: string[], timeout = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => { out += d.toString() })
    child.stderr?.on('data', (d) => { err += d.toString() })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`exec 超时 ${bin} ${args.join(' ')}`)) }, timeout)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(`exec 失败 (code=${code}) ${bin} ${args.join(' ')}\n${out}${err}`))
    })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

/** 等待子进程退出。 */
function waitExit(child: ChildProcessLike, ms: number): Promise<void> {
  if (!child) return Promise.resolve()
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    const t = setTimeout(() => resolve(), ms)
    child.once('exit', () => { clearTimeout(t); resolve() })
  })
}

/** 极简 semver 比较（只处理 x.y.z，忽略预发布后缀）。 */
function semverLt(a: string, b: string): boolean {
  const pa = (a || '').split('.').map((n) => parseInt(n.replace(/\D/g, '') || '0', 10))
  const pb = (b || '').split('.').map((n) => parseInt(n.replace(/\D/g, '') || '0', 10))
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}
