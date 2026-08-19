/**
 * Unified DSH Studio dev loop: client watch + host watch in one command.
 *
 * Previously `pnpm dev` only ran the client watch (`dev-web.ts`), so host
 * logic required a manual `pnpm build`. This orchestrator runs both:
 *
 *   - client watch: `tsx scripts/dev-web.ts`  (rebuilds lib/client.js on
 *     source change → browser auto-reloads via host client-hmr)
 *   - host watch:   `tsx scripts/dev-host-watch.ts` (rebuilds `lib/index.js`
 *     via `tsc -b --watch` on source change)
 *
 * Both run as child processes; Ctrl-C tears both down.
 *
 * NOTE: dsh does not support module-level HMR for host plugins, so after a
 * host edit you still restart dsh — the manual `pnpm build` step is simply
 * gone (`lib/index.js` is already fresh).
 *
 * Usage: `pnpm dev`.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const clientScript = resolve(root, 'scripts/dev-web.ts')
const hostScript = resolve(root, 'scripts/dev-host-watch.ts')

function start(cmd: string, args: string[], label: string) {
  const p = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '1' } })
  const prefix = `\u001b[36m${label}\u001b[0m `
  p.stdout?.on('data', (d: Buffer) => process.stdout.write(prefix + d.toString()))
  p.stderr?.on('data', (d: Buffer) => process.stderr.write(prefix + d.toString()))
  p.on('error', (err) => { console.error(`${label} failed: ${err.message}`); process.exit(1) })
  return p
}

// 用 Node 直接运行 tsx 的 CLI 入口，避免平台差异（Windows 上 .bin/tsx 是
// POSIX sh 脚本、.CMD 不能直接被 Node spawn；统一走 node + ESM CLI 最稳）。
const tsxCli = resolve(root, 'node_modules/tsx/dist/cli.mjs')
const nodeBin = process.execPath

const procs = [
  start(nodeBin, [tsxCli, clientScript], 'client'),
  start(nodeBin, [tsxCli, hostScript], 'host'),
]

let shuttingDown = false
const shutdown = (signal: NodeJS.Signals | 'exit') => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[dev] shutting down (${signal})`)
  procs.forEach((p) => { try { p.kill('SIGINT') } catch { /* noop */ } })
  // Give children a moment, then force-kill leftovers.
  setTimeout(() => { procs.forEach((p) => { try { p.kill('SIGKILL') } catch { /* noop */ } }) }, 1500).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// Keep this process alive while both children run. If one watcher dies (e.g.
// a startup error), tear the other one down so `pnpm dev` exits instead of
// leaving a silent half-broken loop.
procs.forEach((p, i) => p.on('exit', (code, signal) => {
  const label = i === 0 ? 'client' : 'host'
  if (!shuttingDown) {
    console.error(`[dev] ${label} exited (${signal ?? code ?? 'unknown'}), stopping dev loop`)
    shutdown('exit')
    process.exitCode = 1
  }
}))
