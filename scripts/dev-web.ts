/**
 * Watch-build for dsh-studio client-plugin HMR.
 *
 * Runs every package under packages/ that declares `dsh.client` (platform
 * "web") through the tsdown JS API in watch mode. The host webserver's
 * `client-hmr` plugin stat-polls the bundles it serves and broadcasts
 * `rebuilt` frames itself, so any process rewriting `lib/client.js` triggers
 * browser reloads — this script is just the convenient way to keep them all
 * rebuilt on source change.
 *
 * Usage: `pnpm dev`. Mirrors the official dev-web.ts; this variant scans the
 * `dsh-studio` aggregate plus the `dsh-studio-*` feature packages (single-star glob)
 * instead of a whole monorepo.
 *
 * The official `--poll` chokidar passthrough (`inputOptions.watch.watcher`)
 * is intentionally not ported: tsdown 0.11.13 / rolldown 1.0-beta rejects
 * that shape. Watch uses native fs events; on network mounts revisit this
 * once tsdown exposes a supported polling option.
 */
import { globSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'tsdown'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** Every package.json carrying dsh.client.platform "web" under the dsh-studio* packages. */
export function discoverPluginDirs(root = repoRoot): string[] {
  const dirs: string[] = []
  for (const manifestPath of globSync('packages/dsh-studio*/package.json', { cwd: root }).sort()) {
    const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8')) as {
      dsh?: { client?: { platform?: unknown } }
    }
    if (manifest.dsh?.client?.platform === 'web') dirs.push(dirname(manifestPath).split(sep).join('/'))
  }
  return dirs
}

/** Start the tsdown watch build used by `pnpm dev`. */
export async function watchClientPlugins(
  root: string,
  pluginDirs: readonly string[],
): Promise<void> {
  // 单包方案：每个包单独起 tsdown watch（workspace 模式无意义）。
  const bundles: unknown[] = []
  for (const dir of pluginDirs) {
    bundles.push(await build({ cwd: join(root, dir), watch: true }))
  }
  return void bundles
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  const pluginDirs = discoverPluginDirs()
  if (pluginDirs.length === 0) {
    console.error('dev: no dsh.client (platform "web") packages found under packages/')
    process.exit(1)
  }

  if (process.argv.slice(2).length > 0) {
    console.error('dev: usage: tsx scripts/dev-web.ts')
    process.exit(1)
  }

  await watchClientPlugins(repoRoot, pluginDirs)
  console.log(
    `dev: watching ${String(pluginDirs.length)} dsh.client plugin packages:\n  ${pluginDirs.join('\n  ')}`,
  )
}
