/** dsh-studio client bundle config (mirrors the official preset, minimal). */
import { defineConfig } from 'tsdown'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ID = 'dsh-studio'
const pkgDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ env }) => ({
  // Host pass (the tsc build in package.json emits lib/*.js already); the
  // dev-web tooling only needs the browser bundle. Keep it self-contained for
  // this standalone repo.
  name: `${ID}/client`,
  entry: env?.DSH_BUILD_FACE === 'host' ? '' : { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
  // In watch mode, ignore host-side sources and tsc's tsbuildinfo so a host
  // edit does not trigger a redundant client rebuild/browser reload.
  // chokidar v4 matches ignored strings by exact path, so list the host files
  // precisely and resolve them against the package directory.
  ignoreWatch: ['tsconfig.tsbuildinfo', 'src/index.ts', 'src/state.ts', 'src/store.ts'].map(f => join(pkgDir, f)),
  // react and cordis services are provided by the loader's module table at
  // runtime — never bundled.
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
