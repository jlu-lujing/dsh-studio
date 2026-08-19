/** Persistent user + token store for dsh-studio-lan-auth. */

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

interface StoredUser {
  id: string
  username: string
  /** scrypt of the raw password; legacy trailing hex ('sha256:' marker) auto-upgraded on login. */
  passwordHash: string
  createdAt: string
}

interface StoredToken {
  id: string
  name: string
  /** sha256 of the raw token; raw value shown once at creation. */
  tokenHash: string
  createdAt: string
  lastUsedAt: string
  /** Absolute expiry (ISO). A past value revokes the token; refreshed on use for sliding sessions. */
  expiresAt: string
}

interface StoreFile {
  users: StoredUser[]
  tokens: StoredToken[]
}

export interface TokenRecord {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string
  /** Token expiry (ISO); may be in the past for an expired token. */
  expiresAt: string
}

/**
 * Brute-force guard state for one identity (username, or the whole store when
 * the request carries no identity). Kept in process memory: a restart clears
 * it, which is acceptable — the lock is a rate damper, not a durable ban.
 */
interface LoginThrottle {
  /** Rolling window of failed login timestamps (ms epoch). */
  failures: number[]
}

export interface Store {
  load(): void
  listUsers(): Array<{ id: string; username: string; createdAt: string }>
  createUser(username: string, password: string): Promise<{ id: string; username: string } | undefined>
  removeUser(id: string): boolean
  listTokens(): TokenRecord[]
  createToken(name: string, ttlMs?: number): { id: string; name: string; token: string; expiresAt: string }
  removeToken(id: string): boolean
  /** Validate raw password against a username. */
  checkLogin(username: string, password: string): Promise<boolean>
  /** Validate a raw bearer token; updates lastUsedAt on success. */
  checkToken(raw: string): boolean
  /** Validate a username+password login; returns a fresh session token. */
  loginToken(username: string, password: string, ttlMs?: number): Promise<string | undefined>
  /** Revoke a token by its raw value (logout): removes it so it can no longer be used. */
  revokeToken(raw: string): boolean
  /** Register one failed login attempt; returns whether the identity is now throttled. */
  noteLoginFailure(identity: string): boolean
  /** Whether `identity` is currently blocked by too many recent failures. */
  isLoginThrottled(identity: string): boolean
  /** Reset the failure window for `identity` (on a successful login or cooldown expiry). */
  resetLoginFailures(identity: string): void
}

/** Token hashing (random high-entropy values — a fast hash is appropriate). */
const hash = (v: string) => createHash('sha256').update(v).digest('hex')

/** Minimum scrypt cost: N=16384 / r=8 / p=1, matching Node's default. */
const SCRYPT_KEYLEN = 32
const scryptAsync = promisify(scrypt) as (password: string | Buffer, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>

async function scryptPassword(password: string, salt: Buffer): Promise<string> {
  const key = await scryptAsync(password, salt, SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1 })
  return `${salt.toString('base64')}:${key.toString('base64')}`
}

const isLegacyPasswordHash = (value: string): boolean => /^[0-9a-f]{64}$/.test(value)

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isLegacyPasswordHash(stored)) {
    // Pre-scrypt state file: sha256 with no salt. Compare in constant time
    // (hashes equal length — timingSafeEqual is safe).
    return timingSafeEqual(createHash('sha256').update(password).digest(), Buffer.from(stored, 'hex'))
  }
  const [saltB64, keyB64, keyLen, n] = stored.split(':')
  if (!saltB64 || !keyB64 || (keyLen && Number(keyLen) !== SCRYPT_KEYLEN)) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(keyB64, 'base64')
  const cost = n ? Number(n) : 16384
  const key = await scryptAsync(password, salt, SCRYPT_KEYLEN, { N: cost, r: 8, p: 1 })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

async function rehashPassword(password: string, stored: string): Promise<string | null> {
  // Upgrade a legacy / non-default-cost hash only after the password verified.
  if (isLegacyPasswordHash(stored)) return scryptPassword(password, randomBytes(16))
  const [saltB64, , keyLen, n] = stored.split(':')
  if ((keyLen && Number(keyLen) !== SCRYPT_KEYLEN) || (n && Number(n) !== 16384)) {
    return scryptPassword(password, Buffer.from(saltB64 ?? '', 'base64'))
  }
  return null
}
const newId = (p: string) => `${p}_${randomBytes(6).toString('hex')}`

/**
 * Resolve the dsh-studio-lan-auth runtime dirs. `$DSH_HOME` already points at
 * the per-user config root (e.g. `~/.dsh`), so we must NOT re-append `.dsh`.
 * Falls back to `$HOME/.dsh` when `$DSH_HOME` is unset.
 */
export function lanAuthRoot(home = process.env.DSH_HOME ?? join(process.env.HOME ?? '.', '.dsh')): string {
  return home
}

export function createStore(stateDir?: string): Store {
  const dir = stateDir ?? lanAuthRoot()
  const file = join(dir, 'dsh-studio-lan-auth', 'state.json')
  let data: StoreFile = { users: [], tokens: [] }

  // ── hardening defaults ───────────────────────────────────────────────
  // Static (admin-created) tokens: no sliding renewal — they expire on an
  // absolute deadline. Session tokens (password login): sliding — each use
  // pushes the expiry forward, capping an idle session.
  const STATIC_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
  const SESSION_TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
  // Brute-force damper: more than 5 failed logins for one identity inside 15
  // minutes blocks further attempts until the window rolls past.
  const FAIL_WINDOW_MS = 15 * 60 * 1000
  const FAIL_LIMIT = 5
  /** In-memory failure buckets keyed by identity (username, or `anon:<source-ip>`). */
  const failureBuckets = new Map<string, LoginThrottle>()

  const now = () => Date.now()
  const isoNow = () => new Date().toISOString()

  const persist = () => {
    mkdirSync(dirname(file), { recursive: true })
    // Atomic write (tmp + rename): a crash mid-write must never leave a torn
    // users/tokens file behind.
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, file)
  }

  // Hot-path persistence: checkToken runs on every proxied gateway request,
  // and a full file write per request was an I/O hotspot (and a crash window).
  // In-memory stays authoritative; the hot path only schedules a debounced
  // write, and mutations (create/revoke/login) persist immediately as before.
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  const schedulePersist = () => {
    if (persistTimer !== undefined) return
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      persist()
    }, 2_000)
    persistTimer.unref()
  }
  // Flush any pending hot-path write on a clean exit (atomic writes already
  // make crashes loss-bounded to the debounce window).
  process.on('exit', () => {
    if (persistTimer !== undefined) {
      clearTimeout(persistTimer)
      persistTimer = undefined
      persist()
    }
  })

  const normalizeToken = (t: StoredToken): TokenRecord => ({
    id: t.id, name: t.name, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, expiresAt: t.expiresAt,
  })

  /** Drop tokens whose absolute expiry has passed (persists on change). */
  const purgeExpired = (): void => {
    const before = data.tokens.length
    const cutoff = now()
    data.tokens = data.tokens.filter(t => Date.parse(t.expiresAt) > cutoff)
    if (data.tokens.length !== before) persist()
  }

  /** Sliding renewal for session tokens: push the expiry forward from now. */
  const slideToken = (t: StoredToken): void => {
    const remaining = Math.max(0, Date.parse(t.expiresAt) - Date.parse(t.lastUsedAt))
    t.lastUsedAt = isoNow()
    t.expiresAt = new Date(now() + remaining).toISOString()
  }

  return {
    load() {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as StoreFile
        data = { users: parsed.users ?? [], tokens: parsed.tokens ?? [] }
      } catch {
        data = { users: [], tokens: [] }
      }
      // Backfill any pre-hardening tokens (no expiresAt) and drop the expired.
      let changed = false
      for (const t of data.tokens) {
        if (!t.expiresAt) {
          const hadSession = t.name.startsWith('session:')
          t.expiresAt = new Date(now() + (hadSession ? SESSION_TOKEN_TTL_MS : STATIC_TOKEN_TTL_MS)).toISOString()
          changed = true
        }
      }
      purgeExpired()
      if (changed) persist()
    },
    listUsers() {
      return data.users.map(u => ({ id: u.id, username: u.username, createdAt: u.createdAt }))
    },
    async createUser(username, password) {
      const uname = username.trim()
      if (!uname || !password) return undefined
      if (data.users.some(u => u.username === uname)) return undefined
      const user: StoredUser = {
        id: newId('u'), username: uname, passwordHash: await scryptPassword(password, randomBytes(16)), createdAt: new Date().toISOString(),
      }
      data.users.push(user)
      persist()
      return { id: user.id, username: user.username }
    },
    removeUser(id) {
      const before = data.users.length
      data.users = data.users.filter(u => u.id !== id)
      if (data.users.length !== before) { persist(); return true }
      return false
    },
    listTokens() {
      return data.tokens.map(normalizeToken)
    },
    createToken(name, ttlMs) {
      const raw = randomBytes(24).toString('base64url')
      const expiresAt = new Date(now() + (ttlMs ?? STATIC_TOKEN_TTL_MS)).toISOString()
      const token: StoredToken = {
        id: newId('t'), name: name.trim() || 'token',
        tokenHash: hash(raw), createdAt: isoNow(), lastUsedAt: isoNow(), expiresAt,
      }
      data.tokens.push(token)
      persist()
      return { id: token.id, name: token.name, token: raw, expiresAt }
    },
    removeToken(id) {
      const before = data.tokens.length
      data.tokens = data.tokens.filter(t => t.id !== id)
      if (data.tokens.length !== before) { persist(); return true }
      return false
    },
    async checkLogin(username, password) {
      const user = data.users.find(u => u.username === username)
      if (!user) return false
      return verifyPassword(password, user.passwordHash)
    },
    /** Validate a username+password login; returns a fresh token on success. */
    async loginToken(username, password, ttlMs) {
      const user = data.users.find(u => u.username === username)
      if (!user) return undefined
      if (!(await verifyPassword(password, user.passwordHash))) return undefined
      // Verified credentials: transparently upgrade a legacy (sha256) hash or a
      // non-default cost to the current scrypt params.
      const upgraded = await rehashPassword(password, user.passwordHash)
      if (upgraded !== null) {
        user.passwordHash = upgraded
        persist()
      }
      const raw = randomBytes(24).toString('base64url')
      const token: StoredToken = {
        id: newId('t'), name: `session:${username}`, tokenHash: hash(raw),
        createdAt: isoNow(), lastUsedAt: isoNow(),
        expiresAt: new Date(now() + (ttlMs ?? SESSION_TOKEN_TTL_MS)).toISOString(),
      }
      data.tokens.push(token)
      persist()
      return raw
    },
    checkToken(raw) {
      purgeExpired()
      const h = hash(raw)
      const t = data.tokens.find(x => x.tokenHash === h)
      if (!t) return false
      // Session tokens slide (idle cap); static tokens do not.
      if (t.name.startsWith('session:')) slideToken(t)
      else t.lastUsedAt = isoNow()
      // Hot path: debounce the disk write (see schedulePersist).
      schedulePersist()
      return true
    },
    revokeToken(raw) {
      const h = hash(raw)
      const before = data.tokens.length
      data.tokens = data.tokens.filter(t => t.tokenHash !== h)
      if (data.tokens.length !== before) { persist(); return true }
      return false
    },
    noteLoginFailure(identity) {
      const bucket = failureBuckets.get(identity) ?? { failures: [] }
      const cutoff = now() - FAIL_WINDOW_MS
      bucket.failures = [...bucket.failures.filter(ts => ts > cutoff), now()]
      failureBuckets.set(identity, bucket)
      return bucket.failures.length >= FAIL_LIMIT
    },
    isLoginThrottled(identity) {
      const bucket = failureBuckets.get(identity)
      if (!bucket) return false
      const cutoff = now() - FAIL_WINDOW_MS
      const recent = bucket.failures.filter(ts => ts > cutoff)
      if (recent.length === 0) failureBuckets.delete(identity)
      return recent.length >= FAIL_LIMIT
    },
    resetLoginFailures(identity) {
      failureBuckets.delete(identity)
    },
  }
}
