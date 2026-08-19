/** dsh-kit-lan-auth host plugin: HTTPS gateway over the loopback DSH web server. */

import path from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { ensureCertBundle } from './cert.ts'
import { startGateway } from './gateway.ts'
import { createStore, lanAuthRoot } from './store.ts'

/** Cordis plugin name. */
export const name = 'dsh-kit-lan-auth'

/**
 * Services required: webServer hosts the admin routes. The browse
 * directory-picker pair is mounted centrally by the dsh-kit aggregate (so it
 * also works for local loopback without lan-auth), so this plugin no longer
 * injects loader entries itself.
 */
export const inject = ['webServer']

export interface Config {
  /** Gateway bind host (all-interfaces). */
  host?: string
  /** Gateway TLS port (0 → OS-assigned). */
  port?: number
  /** Cert/key output dir. */
  certDir?: string
  /** Runtime root containing `dsh-kit-lan-auth/state.json` (default: $DSH_HOME). */
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

export function apply(ctx: Context, config: Config = {}): void {
  // $DSH_HOME is the dsh per-user config root (~/.dsh). Never append `.dsh`
  // again — createStore/lanAuthRoot already resolve that correctly.
  const root = lanAuthRoot()
  const certDir = config.certDir ?? path.join(root, 'dsh-kit-lan-auth', 'certs')
  const stateDir = config.stateDir ?? root

  const store = createStore(stateDir)
  store.load()

  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const targetPort = typeof webServer.port === 'number' ? webServer.port : 3080
  const target = `http://127.0.0.1:${targetPort}`

  // Zero-config TLS: exists → use verbatim; empty dir → auto-generate a private
  // CA + leaf (clients may install the root once for permanent no-warning).
  const tls = ensureCertBundle(certDir)
  const caCertPath = path.join(certDir, 'ca.pem')
  const gateway = startGateway({
    target, tls,
    host: config.host ?? '0.0.0.0', port: config.port ?? 3443, store,
    caCertPath,
  })

  // ── admin / management routes (loopback-hosted on DSH webServer) ────────
  // Management is local-only: it must be a genuine loopback request AND not
  // one that arrived through the LAN gateway (the gateway stamps proxied LAN
  // traffic so an authorized LAN caller still cannot reach the admin plane).
  const isLocal = (req: IncomingMessage) => {
    if (req.headers['x-dsh-kit-lan-auth-proxy'] === '1') return false
    const a = (req.socket?.remoteAddress ?? '').replace(/^::ffff:/, '')
    return a === '127.0.0.1' || a === '::1'
  }
  const adminOnly = (req: IncomingMessage): boolean => isLocal(req)

  const routes: Array<{ kind: 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }> = [
    {
      kind: 'exact',
      path: '/dsh-kit-lan-auth/status',
      handler: (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
        if (!adminOnly(req)) return sendJson(res, 403, { error: 'local only' })
        return sendJson(res, 200, {
          port: gateway.port(),
          target,
          users: store.listUsers(),
          tokens: store.listTokens(),
        })
      },
    },
    {
      kind: 'exact',
      path: '/dsh-kit-lan-auth/users',
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
      path: '/dsh-kit-lan-auth/users/delete',
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
      path: '/dsh-kit-lan-auth/tokens',
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
      path: '/dsh-kit-lan-auth/tokens/delete',
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
  ctx.effect(() => () => disposers.forEach((d) => d?.()), 'dsh-kit-lan-auth.admin-routes')
  ctx.effect(() => () => { gateway.close().catch(() => undefined) }, 'dsh-kit-lan-auth.gateway')
}
