/**
 * dsh-plugin 生态目录：从 GitHub Search API 拉取 `topic:dsh-plugin` 仓库，
 * 只用于功能商店里的「只读展示」（不提供安装——各仓库安装方式不同）。
 *
 * 抓取策略借鉴 0xKcyzz/dsh-plugin-store（MIT）：
 * - GitHub Search 单查询最多 1000 条，所以按 `stars:` 分片，合并后按 star 降序。
 * - 首次访问先同步抓 top 页（100 条，秒出），同时后台补全全量。
 * - 磁盘缓存 30 分钟（`~/.dsh/dsh-studio/ecosystem-cache.json`）；未认证搜索限流
 *   10 次/分钟，配置 `GITHUB_TOKEN` 可提升到 30 次/分钟。
 * - 网络失败 / 无缓存时回退到包内置的 ecosystem-fallback.json 快照。
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface EcosystemEntry {
  full_name: string
  owner: string
  name: string
  description: string
  stars: number
  language: string | null
  license: string | null
  html_url: string
  updated_at: string
  pushed_at: string
  archived: boolean
  fork: boolean
}

export interface EcosystemResult {
  total: number
  entries: EcosystemEntry[]
  /** 已加载条数（供 UI 显示加载进度）。 */
  fetched: number
  /** true = 后台仍在补全 / 当前不是完整目录。 */
  partial: boolean
  /** 磁盘缓存写入时间（epoch ms）。 */
  cachedAt: number
  /** 数据来源：cache / live / fallback。 */
  source: 'cache' | 'live' | 'fallback'
}

const GITHUB_API = 'https://api.github.com/search/repositories'
const QUERY = 'topic:dsh-plugin'
const PER_PAGE = 100
const MAX_PAGES = 10 // 每个分片保持 <1000 条结果上限
const CACHE_TTL_MS = 30 * 60 * 1000

// 互不相交的 star 区间，合起来覆盖所有仓库；长尾（0/1/2 星）分片单独拆开。
const STAR_RANGES = ['>=10', '5..9', '3..4', '2', '1', '0']
const RETRY_DELAY_MS = 30_000
const MAX_RETRIES = 3

function dshHome(): string {
  return process.env.DSH_HOME ?? `${process.env.HOME ?? '.'}/.dsh`
}

function cacheFile(): string {
  return join(dshHome(), 'dsh-studio', 'ecosystem-cache.json')
}

interface CacheShape {
  at: number
  total: number
  entries: EcosystemEntry[]
  partial: boolean
}

function readDiskCache(): CacheShape | null {
  try {
    if (!existsSync(cacheFile())) return null
    const parsed = JSON.parse(readFileSync(cacheFile(), 'utf8')) as Partial<CacheShape>
    if (typeof parsed?.at !== 'number' || !Array.isArray(parsed?.entries)) return null
    return parsed as CacheShape
  } catch {
    return null
  }
}

function writeDiskCache(cache: CacheShape): void {
  try {
    // Atomic write (tmp + rename): a torn cache file would only force a
    // re-fetch, but an atomic swap costs nothing.
    const file = cacheFile()
    writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(cache), 'utf8')
    renameSync(`${file}.${process.pid}.tmp`, file)
  } catch {
    // best-effort: 缓存只是加速，写失败不影响展示
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalize(item: Record<string, unknown>): EcosystemEntry {
  const owner = (item.owner ?? {}) as { login?: string }
  const license = (item.license ?? null) as { spdx_id?: string } | null
  return {
    full_name: String(item.full_name ?? ''),
    owner: owner.login ?? '',
    name: String(item.name ?? ''),
    description: typeof item.description === 'string' ? item.description : '',
    stars: typeof item.stargazers_count === 'number' ? item.stargazers_count : 0,
    language: typeof item.language === 'string' ? item.language : null,
    license: license?.spdx_id ?? null,
    html_url: String(item.html_url ?? ''),
    updated_at: String(item.updated_at ?? ''),
    pushed_at: String(item.pushed_at ?? ''),
    archived: item.archived === true,
    fork: item.fork === true,
  }
}

interface ShardResult {
  total: number
  entries: EcosystemEntry[]
  partial: boolean
}

async function fetchShard(range: string, headers: Record<string, string>, delayMs: number): Promise<ShardResult> {
  const q = `${QUERY} stars:${range}`
  const entries: EcosystemEntry[] = []
  let total = 0
  let partial = false

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${GITHUB_API}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`
    let data: { total_count?: number; items?: Record<string, unknown>[] } | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, { headers })
      if (res.status === 403 || res.status === 429) {
        await sleep(RETRY_DELAY_MS)
        continue
      }
      if (!res.ok) throw new Error(`GitHub API request failed (HTTP ${res.status})`)
      data = await res.json() as { total_count?: number; items?: Record<string, unknown>[] }
      break
    }

    if (data === null) {
      partial = true
      break
    }

    if (page === 1) total = typeof data.total_count === 'number' ? data.total_count : 0
    const items = Array.isArray(data.items) ? data.items : []
    for (const item of items) entries.push(normalize(item))
    if (items.length < PER_PAGE) break
    await sleep(delayMs)
  }

  return { total, entries, partial }
}

function githubHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dsh-studio',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function fetchTopPage(token: string): Promise<ShardResult> {
  const url = `${GITHUB_API}?q=${encodeURIComponent(QUERY)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=1`
  const res = await fetch(url, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API request failed (HTTP ${res.status})`)
  const data = await res.json() as { total_count?: number; items?: Record<string, unknown>[] }
  return {
    total: typeof data.total_count === 'number' ? data.total_count : 0,
    entries: (Array.isArray(data.items) ? data.items : []).map(normalize),
    partial: true,
  }
}

/** 全量抓取（分片 + 合并），供后台补全使用。 */
async function fetchFullCatalog(token: string): Promise<ShardResult> {
  // 未认证搜索 10 req/min（约 6.5s 间隔）；认证后 30 req/min（约 2.1s 间隔）。
  const delayMs = token ? 2100 : 6500
  const seen = new Set<string>()
  const entries: EcosystemEntry[] = []
  let total = 0
  let partial = false

  for (const range of STAR_RANGES) {
    const shard = await fetchShard(range, githubHeaders(token), delayMs)
    total += shard.total
    if (shard.partial) partial = true
    for (const entry of shard.entries) {
      if (!seen.has(entry.full_name)) {
        seen.add(entry.full_name)
        entries.push(entry)
      }
    }
    if (shard.partial) break
  }

  entries.sort((a, b) => b.stars - a.stars || a.full_name.localeCompare(b.full_name))
  return { total, entries, partial }
}

/** 内置快照（npm 包里随包分发），网络完全不可用时的兜底。 */
function readBundledFallback(): EcosystemEntry[] {
  try {
    const url = new URL('../ecosystem-fallback.json', import.meta.url)
    const parsed = JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as EcosystemEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export interface EcosystemController {
  /** 按需读取目录：优先新鲜缓存，否则 top 页 / fallback，并触发后台全量。 */
  catalog(force: boolean): Promise<EcosystemResult>
}

/** 创建生态目录控制器（dsh-studio host 持有单例）。 */
export function createEcosystemController(): EcosystemController {
  const token = process.env.GITHUB_TOKEN ?? ''
  let cache: CacheShape | null = readDiskCache()
  let topCache: CacheShape | null = null
  let refreshing = false

  function refreshInBackground(): void {
    if (refreshing) return
    refreshing = true
    void (async () => {
      try {
        const full = await fetchFullCatalog(token)
        cache = { at: Date.now(), total: full.total, entries: full.entries, partial: full.partial }
        writeDiskCache(cache)
      } catch {
        // 保留现有缓存
      } finally {
        refreshing = false
      }
    })()
  }

  async function fetchFastTop(): Promise<CacheShape> {
    try {
      const top = await fetchTopPage(token)
      topCache = { at: Date.now(), total: top.total, entries: top.entries, partial: true }
      return topCache
    } catch {
      if (topCache) return topCache
      const fallback = readBundledFallback()
      return { at: 0, total: fallback.length, entries: fallback, partial: true }
    }
  }

  async function catalog(force: boolean): Promise<EcosystemResult> {
    if (!force) {
      const fresh = cache !== null && Date.now() - cache.at < CACHE_TTL_MS
      if (fresh && cache && !cache.partial) {
        return { total: cache.total, entries: cache.entries, fetched: cache.entries.length, partial: false, cachedAt: cache.at, source: 'cache' }
      }
      if (cache) {
        refreshInBackground()
        return { total: cache.total, entries: cache.entries, fetched: cache.entries.length, partial: true, cachedAt: cache.at, source: 'cache' }
      }
      if (topCache) {
        refreshInBackground()
        return { total: topCache.total, entries: topCache.entries, fetched: topCache.entries.length, partial: true, cachedAt: topCache.at, source: topCache.at === 0 ? 'fallback' : 'live' }
      }
      // 无任何缓存：先同步抓 top 页给首屏，同时后台全量。
      refreshInBackground()
      const top = await fetchFastTop()
      return { total: top.total, entries: top.entries, fetched: top.entries.length, partial: true, cachedAt: top.at, source: top.at === 0 ? 'fallback' : 'live' }
    }

    // force：用现有数据先顶住，后台重新全量；client 可稍后再次刷新拿新数据。
    refreshInBackground()
    if (cache) {
      return { total: cache.total, entries: cache.entries, fetched: cache.entries.length, partial: true, cachedAt: cache.at, source: 'cache' }
    }
    const top = await fetchFastTop()
    return { total: top.total, entries: top.entries, fetched: top.entries.length, partial: true, cachedAt: top.at, source: top.at === 0 ? 'fallback' : 'live' }
  }

  return { catalog }
}
