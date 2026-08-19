/** dsh-kit-worktree client bundle config (mirrors webui/lan-auth, minimal). */
import { defineConfig } from 'tsdown'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ID = 'dsh-kit-worktree'
const pkgDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ env }) => ({
  name: `${ID}/client`,
  entry: env?.DSH_BUILD_FACE === 'host' ? '' : { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
  ignoreWatch: ['tsconfig.tsbuildinfo', 'src/index.ts', 'src/worktree.ts'].map(f => join(pkgDir, f)),
  external: ['react', /^@deepseek-ai\//],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}))
