/** dsh-studio-lan-auth host plugin: HTTPS gateway over the loopback DSH web server. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { ensureCertBundle } from './cert.ts'
import { startGateway, type GatewayHandle } from './gateway.ts'
import { createStore as createLanStore, lanAuthRoot } from './store.ts'

/** Cordis plugin name. */
export const name = 'dsh-studio-lan-auth'

/**
 * Services required: webServer hosts the admin routes. The browse
 * directory-picker pair is mounted centrally by the dsh-studio aggregate (so it
 * also works for local loopback without lan-auth), so this plugin no longer
 * injects loader entries itself.
 */
export const inject = ['webServer']

/** Feature id in the aggregate store (state.json) — must match store.ts. */
export const FEATURE_ID = 'dsh-studio-lan-auth' as const

/** How often to re-read state.json and reconcile gateway on/off. */
const RECONCILE_MS = 2000

export interface Config {
  /** Gateway bind host (all-interfaces). */
  host?: string
  /** Gateway TLS port (0 → OS-assigned). */
  port?: number
  /** Cert/key output dir. */
  certDir?: string
  /** Runtime root containing `dsh-studio-lan-auth/state.json` (default: $DSH_HOME). */
  stateDir?: string
}

/** Max request body (management routes only ever carry small JSON). */
const MAX_BODY_BYTES = 256 * 1024

/** Read the request body; rejects (and aborts the request) above MAX_BODY_BYTES. */
const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * Aggregate feature-switch state lives in `~/.dsh/dsh-studio/state.json`
 * (owned by the dsh-studio aggregate `state.ts`), NOT in the lan-auth users/
 * tokens store. These two helpers read/write that shared switch so the
 * management routes and the state poller agree with `dsh-studio
 * enable/disable` and the store panel — hot, without a restart.
 */
function studioStateFile(home = process.env.DSH_HOME ?? path.join(process.env.HOME ?? '.', '.dsh')): string {
  return path.join(home, 'dsh-studio', 'state.json')
}

function studioFeatureEnabled(): boolean {
  try {
    const s = JSON.parse(readFileSync(studioStateFile(), 'utf8')) as { features?: Record<string, boolean> }
    return s.features?.[FEATURE_ID] === true
  } catch {
    return false
  }
}

function setStudioFeatureEnabled(enabled: boolean): void {
  const file = studioStateFile()
  let features: Record<string, boolean> = {}
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as { features?: Record<string, boolean> }
    features = s.features ?? {}
  } catch {
    // no file yet → start empty
  }
  features[FEATURE_ID] = enabled
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ features }, null, 2))
  renameSync(tmp, file)
}

export function apply(ctx: Context, config: Config = {}): void {
  // $DSH_HOME is the dsh per-user config root (~/.dsh). Never append `.dsh`
  // again — createLanStore/lanAuthRoot already resolve that correctly.
  const root = lanAuthRoot()
  const certDir = config.certDir ?? path.join(root, 'dsh-studio-lan-auth', 'certs')
  const stateDir = config.stateDir ?? root

  const store = createLanStore(stateDir)
  store.load()

  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const targetPort = typeof (webServer as { port?: unknown }).port === 'number'
    ? (webServer as { port: number }).port
    : 3080
  const target = `http://127.0.0.1:${targetPort}`

  // Zero-config TLS: exists → use verbatim; empty dir → auto-generate a private
  // CA + leaf (clients may install the root once for permanent no-warning).
  const tls = ensureCertBundle(certDir)
  const caCertPath = path.join(certDir, 'ca.pem')

  // ── gateway lifecycle ────────────────────────────────────────────────────
  // `gateway` is the sole handle to the network resource. start() is
  // idempotent (already running → no-op), stop() likewise. Management routes
  // and the state poller both drive the same reconciliation.
  let gateway: GatewayHandle | null = null

  const start = (): boolean => {
    if (gateway !== null) return true
    try {
      gateway = startGateway({
        target, tls,
        host: config.host ?? '0.0.0.0', port: config.port ?? 3443, store,
        caCertPath,
      })
      return true
    } catch (error) {
      // Non-fatal: keep the admin plane alive and report.
      console.warn('[dsh-studio-lan-auth] start failed:', error)
      gateway = null
      return false
    }
  }

  const stop = async (): Promise<void> => {
    const g = gateway
    gateway = null
    if (g !== null) await g.close().catch(() => undefined)
  }

  // Reconcile to the desired state from store; returns whether it's now running.
  const reconcile = async (): Promise<boolean> => {
    const desired = studioFeatureEnabled()
    if (desired) return start()
    await stop()
    return false
  }

  // ── admin / management routes (loopback-hosted on DSH webServer) ────────
  // Management is local-only: it must be a genuine loopback request AND not
  // one that arrived through the LAN gateway (the gateway stamps proxied LAN
  // traffic so an authorized LAN caller still cannot reach the admin plane).
  const isLocal = (req: IncomingMessage) => {
    if (req.headers['x-dsh-studio-lan-auth-proxy'] === '1') return false
    const a = (req.socket?.remoteAddress ?? '').replace(/^::ffff:/, '')
    return a === '127.0.0.1' || a === '::1'
  }
  const adminOnly = (req: IncomingMessage): boolean => isLocal(req)

  const routes: Array<{ kind: 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }> = [
    {
      kind: 'exact',
      path: '/dsh-studio-lan-auth/status',
      handler: (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
        if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
        return sendJson(res, 200, {
          running: gateway !== null,
          port: gateway?.port(),
          desired: studioFeatureEnabled(),
          target,
          users: store.listUsers(),
          tokens: store.listTokens(),
        })
      },
    },
    {
      kind: 'exact',
      path: '/dsh-studio-lan-auth/start',
      handler: async (req, res) => {
        if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
        setStudioFeatureEnabled(true)
        const ok = start()
        return sendJson(res, ok ? 200 : 500, {
          ok, running: gateway !== null, port: gateway?.port(), profile: 'hot',
        })
      },
    },
    {
      kind: 'exact',
      path: '/dsh-studio-lan-auth/stop',
      handler: async (req, res) => {
        if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
        setStudioFeatureEnabled(false)
        await stop()
        return sendJson(res, 200, { ok: true, running: false, profile: 'hot' })
      },
    },
    {
      kind: 'exact',
      path: '/dsh-studio-lan-auth/users',
      handler: async (req, res) => {
        if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
        try {
          const body = JSON.parse((await readBody(req)) || '{}') as { username?: string; password?: string }
          const created = await store.createUser(String(body.username ?? ''), String(body.password ?? ''))
          if (!created) return sendJson(res, 400, { error: 'invalid or duplicate username' })
          return sendJson(res, 200, { ok: true, user: created })
        } catch {
          return sendJson(res, 400, { error: 'bad request' })
        }
      },
    },
    {
      kind: 'exact',
      path: '/dsh-studio-lan-auth/users/delete',
      handler: async (req, res) => {
        if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
        try {
          const body = JSON.parse((await readBody(req)) || '{}') as { id?: string }
          return sendJson(res, 200, { ok: store.removeUser(String(body.id ?? '')) })
        } catch {
          return sendJson(res, 400, { error: 'bad request' })
        }
      },
    },
    {
      kind: 'exact',
      path: '/dsh-studio-lan-auth/tokens',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
          return sendJson(res, 200, { tokens: store.listTokens() })
        }
        if (req.method === 'POST') {
          if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
          try {
            const body = JSON.parse((await readBody(req)) || '{}') as { name?: string }
            return sendJson(res, 200, { ok: true, token: store.createToken(String(body.name ?? 'token')) })
          } catch {
            return sendJson(res, 400, { error: 'bad request' })
          }
        }
        return sendJson(res, 405, { error: 'method not allowed' })
      },
    },
    {
      kind: 'exact',
      path: '/dsh-studio-lan-auth/tokens/delete',
      handler: async (req, res) => {
        if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
        try {
          const body = JSON.parse((await readBody(req)) || '{}') as { id?: string }
          return sendJson(res, 200, { ok: store.removeToken(String(body.id ?? '')) })
        } catch {
          return sendJson(res, 400, { error: 'bad request' })
        }
      },
    },
  ]

  const disposers = routes.map((r) => webServer.register(r))
  ctx.effect(() => () => disposers.forEach((d) => d?.()), 'dsh-studio-lan-auth.admin-routes')

  // ── boot reconcile + periodic hot reconciliation ─────────────────────────
  // Initial: honor the persisted state so a fresh dsh boot still starts the
  // gateway when enabled. Then poll state.json: `dsh-studio enable/disable`
  // and the store panel flip the switch without touching this process, so we
  // reconcile the network resource to match — no restart needed.
  void reconcile()

  const timer = setInterval(() => void reconcile(), RECONCILE_MS)
  ctx.effect(() => () => { clearInterval(timer); void stop() }, 'dsh-studio-lan-auth.gateway')
}
