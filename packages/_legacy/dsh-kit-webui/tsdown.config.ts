/** dsh-kit-webui client bundle config (mirrors dsh-kit-input-history). */
import { defineConfig } from 'tsdown'

const ID = 'dsh-kit-webui'

export default defineConfig({
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
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
})
