/** One-shot client bundle build (non-watch) — mirrors scripts/dev-web.ts but exits after one pass. */
import { globSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'

const root = fileURLToPath(new URL('..', import.meta.url))
const pluginDirs = []
// `dsh-studio` itself (the aggregate) and `dsh-studio-*` feature bundles are all
// candidates; only those declaring dsh.client.platform web are built.
for (const m of globSync('packages/dsh-studio*/package.json', { cwd: root }).sort()) {
  const p = JSON.parse(readFileSync(join(root, m), 'utf8'))
  if (p.dsh?.client?.platform === 'web') pluginDirs.push(dirname(m).split('/').join('/'))
}
console.log('client bundles for:', pluginDirs)
for (const dir of pluginDirs) {
  await build({ cwd: join(root, dir), watch: false })
}
console.log('done')
