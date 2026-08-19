#!/usr/bin/env node
/**
 * Build the dsh-runtime directory + zip for the current platform.
 *
 * The runtime ships:
 *   - node_modules/@deepseek-ai/dsh   (the dsh CLI + its full dep tree)
 *   - node/bin/node                   (optional official Node binary)
 *   - runtime.json                    (schemaVersion/dshVersion/nodeVersion/…)
 *   - VERSION                         (plain-text dsh version)
 *
 * Source of truth for modules: the already-verified global install of
 * `@deepseek-ai/dsh` (`npm root -g`). We reuse its flattened dependency tree
 * (native prebuilds included) instead of re-installing, then trim what is
 * not needed for THIS platform.
 *
 * Usage:
 *   node scripts/build.mjs                # build zip with current-platform node
 *   node scripts/build.mjs --skip-node-download   # modules only (no node bin)
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFileSync, cpSync, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const pkgRoot = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(pkgRoot, 'out')          // <pkg>/out
const skipNodeDownload = process.argv.includes('--skip-node-download')
// 更新发布物格式：默认 zstd-tar（M1，扩展名 .zip）；--tar-gz 额外产出 gzip tar
// （M4 更新链路使用，壳内置 Node 纯 JS 可解压、零外部二进制）。
const tarGz = process.argv.includes('--tar-gz')

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

/** npm 可执行名：Windows 上需 npm.cmd（Node spawn 不认无扩展名 shim）。 */
function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

/**
 * 解析全局 @deepseek-ai/dsh。
 *
 * 优先用 process.execPath 相邻的全局 node_modules（Windows 下 Git Bash /
 * spawn 批处理不稳，直接探测文件最可靠）；探测不到再退到 `npm root -g`。
 */
function findGlobalDsh() {
  const candidates = []
  // 1) 当前 node 同级的全局 node_modules（npm 默认全局根当前就在这）
  candidates.push(join(dirname(process.execPath), 'node_modules'))
  // 2) `npm root -g`（若 spawn 可用；失败静默忽略）
  try {
    candidates.push(execFileSync(npmCmd(), ['root', '-g'], { encoding: 'utf8' }).trim())
  } catch {
    /* spawn npm 不可用（如 Windows 无 shell）时跳过 */
  }
  for (const root of candidates) {
    const pkgDir = join(root, '@deepseek-ai', 'dsh')
    const pkgJson = join(pkgDir, 'package.json')
    if (!existsSync(pkgJson)) continue
    const version = JSON.parse(readFileSync(pkgJson, 'utf8')).version
    console.log(`[build] global dsh : ${pkgDir} (${version})`)
    return { root, pkgDir, version }
  }
  throw new Error(`no @deepseek-ai/dsh found (checked: ${candidates.join(' | ')})`)
}

function hasZstd() {
  const r = spawnSync('zstd', ['--version'], { stdio: 'ignore' })
  return r.status === 0
}

function rmIfExists(p) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true })
}

function fmt(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/* ------------------------------------------------------------------ */
/* metadata                                                             */
/* ------------------------------------------------------------------ */

const dsh = findGlobalDsh()
const platform = process.platform
const arch = process.arch
const nodeVer = process.version.replace(/^v/, '')
const staging = join(tmpdir(), `dsh-runtime-build-${process.pid}-${Date.now()}`)
const destTree = join(staging, 'node_modules')
const nodeExe = platform === 'win32' ? 'node.exe' : 'node'

console.log(`[build] source dsh : ${dsh.pkgDir} (${dsh.version})`)
console.log(`[build] target    : ${platform}-${arch}, node ${nodeVer}`)

/* ------------------------------------------------------------------ */
/* Stage 1 — module tree                                               */
/* ------------------------------------------------------------------ */

console.log('[build] copying flat dependency tree (can take a while)…')
mkdirSync(join(destTree, '@deepseek-ai'), { recursive: true })

// The global install keeps a full flattened node_modules under
// @deepseek-ai/dsh/node_modules. Copy that as the runtime's top-level tree,
// then drop the nested copy (npm leaves it there; the layer above is what
// actually resolves every transitive dep at runtime — verified by smoke).
const srcTree = join(dsh.pkgDir, 'node_modules')
cpSync(srcTree, destTree, { recursive: true })

// place the dsh package itself at node_modules/@deepseek-ai/dsh
cpSync(dsh.pkgDir, join(destTree, '@deepseek-ai', 'dsh'), { recursive: true })

// drop the duplicate nested node_modules inside @deepseek-ai/dsh
rmIfExists(join(destTree, '@deepseek-ai', 'dsh', 'node_modules'))

/* ------------------------------------------------------------------ */
/* Stage 1.5 — bundle the dsh-studio family into the runtime              */
/*                                                                     */
/* 内置 DSH Studio 单包：随 dsh-runtime 一起分发，    */
/* 桌面端装配 profile 时用本地路径 link，不再从 npm 运行时拉取。         */
/* 这样 mac/win 两家一致、离线可用、版本锁死。                          */
/* ------------------------------------------------------------------ */

// DSH Studio 单包（7 合 1：聚合 + 六个功能）。
// npm 包名：@dsh-kit/dsh-studio（scope @dsh-kit 为我们的组织）。
const FAMILY_PACKAGES = ['@dsh-kit/dsh-studio']

// 仓库根 = <apps/dsh-runtime>/../.. ；源码包位于 <root>/packages/<name>
const repoRoot = resolve(pkgRoot, '..', '..')
const familyVersions = {}
for (const name of FAMILY_PACKAGES) {
  // scoped 名 @dsh-kit/dsh-studio → 源码目录 packages/dsh-studio（取最后一段）
  const srcBase = name.startsWith('@') ? name.split('/')[1] : name
  const srcDir = join(repoRoot, 'packages', srcBase)
  const pkgJson = join(srcDir, 'package.json')
  if (!existsSync(pkgJson)) {
    console.warn(`[build] family pkg missing (skipped): ${srcDir}`)
    continue
  }
  const ver = JSON.parse(readFileSync(pkgJson, 'utf8')).version
  familyVersions[name] = ver
  // 只带发布物（lib/bin/cordis.patch.yml 等），不整棵拷贝避免塞入源码/node_modules
  mkdirSync(join(destTree, name), { recursive: true })
  const files = ['package.json', 'lib', 'cordis.patch.yml', 'preset', 'ecosystem-fallback.json', 'bin']
  for (const f of files) {
    const from = join(srcDir, f)
    if (existsSync(from)) cpSync(from, join(destTree, name, f), { recursive: true })
  }
  console.log(`[build] family bundled: ${name}@${ver}`)
}

// dsh-studio 的 cordis.patch.yml 由单包自身提供（node_modules 顶层即可解析，
// 我们已把包放到 node_modules/<name>）。
console.log('[build] family bundled:', JSON.stringify(familyVersions))

/* ------------------------------------------------------------------ */
/* Stage 2 — node binary (optional)                                    */
/* ------------------------------------------------------------------ */

const nodeBinDir = join(staging, 'node', 'bin')
if (skipNodeDownload) {
  console.log('[build] --skip-node-download: skipping official Node binary fetch')
} else {
  mkdirSync(nodeBinDir, { recursive: true })
  console.log('[build] fetching official Node binary…')
  downloadNode(nodeVer, platform, arch, join(nodeBinDir, nodeExe))
}

/* ------------------------------------------------------------------ */
/* Stage 3 — trim cross-platform prebuilds + bloat                     */
/* ------------------------------------------------------------------ */

console.log('[build] trimming non-this-platform artifacts…')
trimPlatformDeps(destTree, platform, arch)
trimMaps(destTree)

/* ------------------------------------------------------------------ */
/* Stage 4 — metadata files                                            */
/* ------------------------------------------------------------------ */

const runtime = {
  schemaVersion: 1,
  dshVersion: dsh.version,
  nodeVersion: nodeVer,
  platform,
  arch,
  builtAt: new Date().toISOString(),
  bin: skipNodeDownload ? undefined : `node/bin/${nodeExe}`,
  launch: ['--expose-internals', 'node_modules/@deepseek-ai/dsh/lib/bin.js'],
  // 内置 dsh-studio 全家桶版本（装配端据此决定用本地 link 而非 npm 拉取）
  family: familyVersions,
}
writeFileSync(join(staging, 'runtime.json'), JSON.stringify(runtime, null, 2) + '\n')
writeFileSync(join(staging, 'VERSION'), `${dsh.version}\n`)

/* ------------------------------------------------------------------ */
/* Stage 5 — archive                                                   */
/* ------------------------------------------------------------------ */

mkdirSync(outDir, { recursive: true })
const base = `dsh-runtime-${dsh.version}-${platform}-${arch}`

// 纯 JS tar+gzip 打包（零外部二进制、跨平台）：Node 直产标准 ustar 格式，
// 桌面端 updater 的 tar-stream 可直接解压。不再依赖系统 tar（Windows 上
// GNU tar 会误把 `C:` 当远端主机）。
const tmpGz = join(outDir, `.${base}.tmp-${process.pid}.tar.gz`)
await createTarGz(staging, tmpGz)

// 产出标准发布物：dsh-runtime-<v>-<platform>-<arch>.zip（gzip tar）
const zipPath = join(outDir, `${base}.zip`)
rmIfExists(zipPath)
copyFileSync(tmpGz, zipPath)

// --tar-gz：额外产出改名一致的 gzip tar（M4 更新链路消费端用）。
let gzPath = null
if (tarGz) {
  gzPath = join(outDir, `${base}.tar.gz`)
  rmIfExists(gzPath)
  copyFileSync(tmpGz, gzPath)
}

rmIfExists(tmpGz)
rmIfExists(staging)

console.log(`[build] done → ${zipPath} (${fmt(statSync(zipPath).size)})`)
if (gzPath) console.log(`[build] done → ${gzPath} (${fmt(statSync(gzPath).size)})`)
console.log('[build] runtime.json:', JSON.stringify(runtime))

/* ------------------------------------------------------------------ */
/**
 * 纯 JS 打包 srcDir 为 gzip tar（标准 ustar，桌面端 tar-stream 可直接解）。
 * 逐文件流式写 512B 头 + 内容；目录/符号链接一并支持；尾部 1024B 零块后 gzip。
 * 零外部二进制、跨平台——不依赖系统 tar（Windows 上 GNU tar 会误把盘符当远端主机）。
 */
/**
 * 纯 JS 打包 srcDir 为 gzip tar（标准 ustar，桌面端 tar-stream 可直接解）。
 * 两阶段：① 写临时未压缩 .tar（Node Writable 顺序写，天然无并发交错）；
 *        ② pipeline(createReadStream, createGzip, createWriteStream) → destFile。
 * 零外部二进制、跨平台——不依赖系统 tar（Windows 上 GNU tar 会误把盘符当远端主机）。
 */
async function createTarGz(srcDir, destFile) {
  const { readdir, readlink, stat } = await import('node:fs/promises')
  const { join: pjoin } = await import('node:path')
  const tmpTar = destFile + '.raw'

  const octal = (n, pad = 12) => n.toString(8).padStart(pad - 1, '0') + '\0'
  const ustar = (name, size, mode, typeflag, linkname = '') => {
    const b = Buffer.alloc(512)
    b.fill(0)
    b.write(name.toString(), 0, 100, 'utf8')
    b.write(octal(mode, 8), 100, 8, 'utf8')
    b.write(octal(1000, 8), 108, 8, 'utf8') // uid
    b.write(octal(1000, 8), 116, 8, 'utf8') // gid
    b.write(octal(size, 12), 124, 12, 'utf8')
    b.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, 'utf8')
    b[156] = typeflag.charCodeAt(0)
    b.write('ustar\0', 257, 6, 'utf8')
    b.write('00', 263, 2, 'utf8')
    if (linkname) b.write(linkname.toString(), 157, 100, 'utf8')
    // tar checksum：checksum 字段位（148-155）按空格参与求和
    b.fill(0x20, 148, 156)
    const sum = b.reduce((a, v) => a + v, 0)
    b.write(octal(sum, 8), 148, 8, 'utf8')
    return b
  }
  const toBuf = (str, padTo512 = false) => {
    const raw = Buffer.from(str, 'utf8')
    return padTo512 ? Buffer.concat([raw, Buffer.alloc((512 - (raw.length % 512)) % 512)]) : raw
  }
  const pad512 = (n) => Buffer.alloc((512 - (n % 512)) % 512)

  // GNU longname 扩展：路径 >100 时先写一个 @LongLink 记录（内容=完整路径名），
  // 随后紧跟该条目自身的真实 header（由调用方负责写）。
  const longEntry = (name) => [
    ustar('././@LongLink', Buffer.byteLength(name), 0o644, 'L'),
    toBuf(name, true),
  ]

  const entries = []
  const walk = async (dir, prefix) => {
    const items = await readdir(dir, { withFileTypes: true })
    for (const it of items) {
      if (it.name === '.DS_Store') continue
      if (it.name.endsWith('.map') || it.name.endsWith('.tsbuildinfo')) continue
      const full = pjoin(dir, it.name)
      const rel = prefix ? `${prefix}/${it.name}` : it.name
      if (it.isDirectory()) {
        entries.push({ rel, full, dir: true })
        await walk(full, rel)
      } else if (it.isSymbolicLink()) {
        entries.push({ rel, full, link: await readlink(full) })
      } else {
        entries.push({ rel, full, dir: false })
      }
    }
  }
  await walk(srcDir, '')

  const out = createWriteStream(tmpTar)
  const write = (b) => new Promise((res, rej) => {
    if (out.write(b)) res()
    else out.once('drain', res).once('error', rej)
  })

  for (const e of entries) {
    const name = e.rel
    if (Buffer.byteLength(name) > 255) throw new Error(`tar path too long: ${name}`)
    const needLong = Buffer.byteLength(name) > 100
    if (e.dir) {
      if (needLong) for (const b of longEntry(name)) await write(b)
      await write(ustar(name, 0, 0o755, '5'))
    } else if (e.link !== undefined) {
      if (needLong) for (const b of longEntry(name)) await write(b)
      await write(ustar(name, 0, 0o644, '2', e.link))
    } else {
      const st = await stat(e.full)
      if (needLong) for (const b of longEntry(name)) await write(b)
      await write(ustar(name, st.size, 0o644, '0'))
      if (st.size > 0) {
        await pipeline(createReadStream(e.full), out, { end: false })
        await write(pad512(st.size))
      }
    }
  }
  // 尾部：1024B 零块
  await write(Buffer.alloc(1024))
  out.end()
  await new Promise((res, rej) => out.on('finish', res).on('error', rej))

  // ② gzip 压缩为最终产物
  await pipeline(createReadStream(tmpTar), createGzip(), createWriteStream(destFile))
  rmIfExists(tmpTar)
}

/* implementations below                                                */
/* ------------------------------------------------------------------ */

function downloadNode(ver, platform, arch, dest) {
  // This skeleton deliberately does not auto-download the ~100MB Node
  // binary (requires a nodejs.org mirror or a pre-staged artifact in CI).
  // Local builds use --skip-node-download; the Electron-shell MVP also
  // works entirely from Electron's bundled Node via DshRuntime (DESKTOP §3.1).
  throw new Error(
    'official Node binary auto-download is not wired in this skeleton; ' +
    `run node scripts/build.mjs --skip-node-download and provide your own ` +
    `node/bin/${platform === 'win32' ? 'node.exe' : 'node'}, or implement ` +
    'downloadNode() in scripts/build.mjs'
  )
}

/** Keep only the current platform's native prebuild packages. */
function trimPlatformDeps(root, platform, arch) {
  // node-pty prebuilds (prebuilds/<platform>-<arch>/)
  const pty = join(root, 'node-pty', 'prebuilds')
  if (existsSync(pty)) {
    for (const d of readdirSync(pty)) {
      if (d !== `${platform}-${arch}`) rmIfExists(join(pty, d))
    }
  }
  // node-addon-require-builtin-<platform>-<arch> (optional deps)
  for (const d of readdirSync(root)) {
    if (d.startsWith('node-addon-require-builtin-') && d !== `node-addon-require-builtin-${platform}-${arch}`) {
      rmIfExists(join(root, d))
    }
  }
  // @img/sharp-* and @img/sharp-libvips-* platform packages
  const img = join(root, '@img')
  if (existsSync(img)) {
    for (const d of readdirSync(img)) {
      if (d.startsWith('sharp-') || d.startsWith('sharp-libvips-')) {
        const suffix = d.replace(/^sharp(-libvips)?-/, '')
        if (suffix !== `${platform}-${arch}`) rmIfExists(join(img, d))
      }
    }
  }
  // @koromix/koffi-<platform>-<arch> optional packages
  const koromix = join(root, '@koromix')
  if (existsSync(koromix)) {
    for (const d of readdirSync(koromix)) {
      if (d.startsWith('koffi-') && d !== `koffi-${platform}-${arch}`) rmIfExists(join(koromix, d))
    }
  }
}

/** Recurse and delete *.map / *.tsbuildinfo (debug only, not needed at runtime). */
function trimMaps(root) {
  const stack = [root]
  const drop = []
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.name.endsWith('.map') || e.name.endsWith('.tsbuildinfo')) drop.push(full)
    }
  }
  for (const f of drop) { try { rmIfExists(f) } catch { /* best-effort */ } }
}
