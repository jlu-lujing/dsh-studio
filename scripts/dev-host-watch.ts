/**
 * Host-side TypeScript watch build for the dsh-studio workspace.
 *
 * `pnpm dev` previously only watched client plugins (`scripts/dev-web.ts`),
 * so host logic (`src/index.ts` → `lib/index.js`) had to be rebuilt manually
 * with `pnpm build` and dsh restarted. This script closes that gap:
 * it runs `tsc -b --watch` for every TypeScript package under packages/ that
 * produces host code, so `lib/index.js` is recompiled automatically on source
 * change.
 *
 * NOTE on dsh's own boundary: even with freshly written `lib/index.js`, the
 * dsh web bundle does NOT support module-level HMR for host plugins, so host
 * changes still require a dsh restart to take effect. What this script adds
 * is removing the manual `pnpm build` step — you just restart dsh.
 *
 * The client watch (`dev-web.ts`) is orchestrated separately by `dev.ts`;
 * run them together via `pnpm dev`.
 *
 * Usage: `tsx scripts/dev-host-watch.ts` (run via `pnpm dev`)
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, globSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

/**
 * Resolve the TypeScript `tsc` binary path via node's resolver so we can
 * launch it as a Node child process (no shell, cross-platform).
 */
function resolveTscPath(): string {
  try {
    return require.resolve('typescript/bin/tsc')
  } catch {
    // Fall back to the well-known path under node_modules/typescript.
    return fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
  }
}

/**
 * Every package tsconfig.json under packages/ that compiles host code.
 * Host packages produce `lib/index.js` via `tsc -b`; dsh-anchored-standard is
 * pure JS (no tsconfig), so it is excluded.
 */
export function discoverHostDirs(root = repoRoot): string[] {
  const dirs: string[] = []
  for (const manifestPath of globSync('packages/dsh-studio*/package.json', { cwd: root }).sort()) {
    const pkgDir = join(root, dirname(manifestPath))
    if (existsSync(join(pkgDir, 'tsconfig.json'))) dirs.push(pkgDir)
  }
  return dirs
}

/**
 * Start `tsc -b --watch` for every host package. Each package gets its own
 * tsc process so a single package's type error doesn't stall the others.
 */
export async function watchHostPlugins(
  root: string,
  hostDirs: readonly string[],
): Promise<void> {
  const tscPath = resolveTscPath()
  if (hostDirs.length === 0) {
    console.error('dev-host-watch: no host (tsconfig) packages found under packages/')
    return
  }

  let killAll = (): void => {}
  let finish = (): void => {}
  let stopping = false

  const procs = hostDirs.map((dir) => {
    const args = ['-b', '--watch', '--preserveWatchOutput']
    const rel = relative(root, dir).split(sep).join('/')
    const p = spawn(process.execPath, [tscPath, ...args], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' },
    })
    const label = `host[${rel}]`
    p.stdout?.on('data', (d: Buffer) => {
      process.stdout.write(`\u001b[90m${label}\u001b[0m ${d.toString()}`)
    })
    p.stderr?.on('data', (d: Buffer) => {
      process.stderr.write(`\u001b[90m${label}\u001b[0m ${d.toString()}`)
    })
    p.on('error', (err) => {
      console.error(`${label} failed to start: ${err.message}`)
    })
    p.on('exit', (code, signal) => {
      if (stopping) return
      console.error(`${label} exited (${signal ?? code ?? 'unknown'}), stopping host watch`)
      process.exitCode = 1
      killAll()
      finish()
    })
    return p
  })

  killAll = () => { stopping = true; procs.forEach((p) => p.kill('SIGINT')) }
  return new Promise<void>((resolveExit) => {
    finish = resolveExit
    process.on('SIGINT', () => { killAll(); finish() })
    process.on('SIGTERM', () => { killAll(); finish() })
    // Keep alive until the parent sends a signal (watch processes are long-lived).
  })
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  const hostDirs = discoverHostDirs()
  console.log(`dev-host-watch: watching ${hostDirs.length} host package(s):\n  ${hostDirs.map((d) => relative(repoRoot, d)).join('\n  ')}`)
  await watchHostPlugins(repoRoot, hostDirs)
}
