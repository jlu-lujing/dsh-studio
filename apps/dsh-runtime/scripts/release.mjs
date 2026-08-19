#!/usr/bin/env node
/**
 * Release helper — 构建当前平台 runtimes 并生成更新 feed（feed.json）。
 *
 * 产出（out/ 下）：
 *   - dsh-runtime-<v>-<platform>-<arch>.zip        （zstd/gzip tar，M1 兼容）
 *   - dsh-runtime-<v>-<platform>-<arch>.tar.gz     （gzip tar，M4 更新链路用）
 *   - feed.json                                    （sha512 + GitHub 下载 URL）
 *
 * 用法：
 *   node scripts/release.mjs [--skip-node-download] [--owner jlu-lujing --repo dsh-studio]
 *
 * feed.url 默认指向 GitHub Releases：
 *   https://github.com/<owner>/<repo>/releases/download/<tag>/<file>.tar.gz
 * 可用 --feed-url-base 覆盖（如企业源 / CDN）。
 */
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const pkgRoot = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(pkgRoot, 'out')
const argv = process.argv.slice(2)
const skipNode = argv.includes('--skip-node-download')
const owner = arg(argv, '--owner') ?? 'jlu-lujing'
const repo = arg(argv, '--repo') ?? 'dsh-studio'
const tag = arg(argv, '--tag') ?? process.env.GITHUB_REF_NAME
const feedUrlBase = arg(argv, '--feed-url-base') ?? ''

function arg(list, name) {
  const i = list.indexOf(name)
  return i >= 0 ? list[i + 1] : undefined
}

// 1) 构建（含 tar.gz）
const buildArgs = [join(pkgRoot, 'scripts', 'build.mjs')]
if (skipNode) buildArgs.push('--skip-node-download')
buildArgs.push('--tar-gz')
const r = spawnSync('node', buildArgs, { cwd: pkgRoot, stdio: 'inherit' })
if (r.status !== 0) process.exit(r.status ?? 1)

// 2) 解析版本与平台：从 build.mjs 产出的 zip 文件名（dsh-runtime-<v>-<platform>-<arch>.zip）推断
const pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
const gzFiles = existsSync(outDir)
  ? readdir(outDir).filter((f) => f.endsWith('.tar.gz'))
  : []
const gz = gzFiles[0]
const nameParts = gz ? gz.replace(/^dsh-runtime-/, '').replace(/\.tar\.gz$/, '').split('-') : []
const dshVersion = nameParts.length >= 3 ? nameParts.slice(0, -2).join('-') : (pkgJson.dependencies?.['@deepseek-ai/dsh']?.replace(/[^\d.]+/g, '') ?? '0.0.0')
const arch = nameParts.length >= 3 ? nameParts[nameParts.length - 1] : process.arch
const platform = nameParts.length >= 3 ? nameParts[nameParts.length - 2] : process.platform

// 3) 组装 feed
const file = `dsh-runtime-${dshVersion}-${platform}-${arch}.tar.gz`
const srcPath = join(outDir, file)
if (!existsSync(srcPath)) {
  console.error(`[release] 缺少 ${srcPath}（请先 --tar-gz 构建）`)
  process.exit(2)
}
const sha512 = createHash('sha512').update(readFileSync(srcPath)).digest('hex')

const url = feedUrlBase
  ? `${feedUrlBase}/${file}`
  : `https://github.com/${owner}/${repo}/releases/download/${tag ?? 'latest'}/${file}`

const feed = {
  schemaVersion: 1,
  dshVersion,
  platform,
  arch,
  url,
  sha512,
  minDesktopVersion: '0.1.0',
  changelog: `dsh-runtime ${dshVersion} (${platform}/${arch})`,
  format: 'tar.gz',
}

writeFileSync(join(outDir, 'feed.json'), JSON.stringify(feed, null, 2) + '\n')
console.log(`[release] feed → ${join(outDir, 'feed.json')}`)
console.log(`[release]   ${dshVersion} @ ${platform}/${arch}`)
console.log(`[release]   url = ${url}`)
console.log(`[release]   sha512 = ${sha512.slice(0, 16)}…`)
console.log(`[release]   size = ${statSync(srcPath).size} bytes`)
