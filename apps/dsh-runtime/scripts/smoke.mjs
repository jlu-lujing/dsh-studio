#!/usr/bin/env node
/**
 * Smoke-test a dsh-runtime directory (or the one we just built in staging/src).
 *
 * Spawns dsh's `web --port 0` with the runtime's node binary (or falls back
 * to the current process's node for `--skip-node-download` layouts), waits
 * for the "dsh web: http://127.0.0.1:<port>" ready line, GETs the URL, and
 * asserts HTTP 200 + an index that carries `__DSH_BOOT__`.
 *
 * Usage:
 *   node scripts/smoke.mjs                     # test <pkg>/node_modules + node
 *   node scripts/smoke.mjs --runtime <dir>     # test an arbitrary runtime dir
 *   node scripts/smoke.mjs --skip-ready-http   # only assert the ready line
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { get } from 'node:http'

const require = createRequire(import.meta.url)
const pkgRoot = fileURLToPath(new URL('..', import.meta.url))

const argv = process.argv.slice(2)
const runtimeDir = argv.includes('--runtime')
  ? argv[argv.indexOf('--runtime') + 1]
  : pkgRoot
const skipHttp = argv.includes('--skip-ready-http')

const dshPkg = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh')
const bin = join(dshPkg, 'lib', 'bin.js')
if (!existsSync(bin)) {
  console.error(`smoke: no dsh bin at ${bin}`)
  process.exit(2)
}

// Prefer the runtime's own Node; fall back to the current process's Node.
let nodeBin
let used = ''
const runtimeJson = join(runtimeDir, 'runtime.json')
let meta = {}
try { meta = JSON.parse(readFileSync(runtimeJson, 'utf8')) } catch { /* optional */ }
const ownNode = join(runtimeDir, meta.bin ?? 'node/bin/node')
try {
  accessSync(ownNode, constants.X_OK)
  nodeBin = ownNode
  used = 'runtime node'
} catch {
  nodeBin = process.execPath
  used = `process node (${process.version})`
}
console.log(`smoke: runtime=${runtimeDir}`)
console.log(`smoke: dsh=${meta.dshVersion ?? bin}`)
console.log(`smoke: node=${used} (${nodeBin})`)

// --expose-internals is required for dsh's HMR service under Electron-as-Node;
// harmless for real Node.
const proc = spawn(nodeBin, ['--expose-internals', bin, 'web', '--port', '0'], {
  env: { ...process.env, DSH_HOME: createTempHome() },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const TIMEOUT_MS = 30_000
let readyUrl = null
let log = ''
const timeout = setTimeout(() => {
  proc.kill('SIGKILL')
  console.error('smoke: timed out waiting for dsh ready line')
  console.error('--- dsh output ---\n' + log)
  process.exit(1)
}, TIMEOUT_MS)

const readyRe = /dsh web: (http:\/\/[^ ]+)/
proc.stdout.on('data', (d) => {
  log += d.toString()
  const m = log.match(readyRe)
  if (m && !readyUrl) {
    readyUrl = m[1]
    if (skipHttp) { finish(0) }
    else verify(readyUrl)
  }
})
proc.stderr.on('data', (d) => { log += d.toString() })
proc.on('exit', (code) => {
  if (!readyUrl) {
    clearTimeout(timeout)
    console.error(`smoke: dsh exited ${code} before ready`)
    console.error('--- dsh output ---\n' + log)
    process.exit(1)
  }
})

function verify(url) {
  get(url, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => {
      clearTimeout(timeout)
      const body = Buffer.concat(chunks).toString()
      const ok = res.statusCode === 200 && body.includes('__DSH_BOOT__')
      proc.kill('SIGINT')
      setTimeout(() => proc.kill('SIGKILL'), 2000).unref()
      if (!ok) {
        console.error(`smoke: GET ${url} → ${res.statusCode}, missing __DSH_BOOT__`)
        process.exit(1)
      }
      console.log(`smoke: OK — ${url} → 200, __DSH_BOOT__ present`)
      console.log(`smoke: ready line: ${readyUrl}`)
      process.exit(0)
    })
  }).on('error', (err) => {
    clearTimeout(timeout)
    console.error(`smoke: GET failed: ${err.message}`)
    process.exit(1)
  })
}

function finish(code) {
  clearTimeout(timeout)
  proc.kill('SIGINT')
  setTimeout(() => proc.kill('SIGKILL'), 2000).unref()
  console.log(`smoke: OK — ${readyUrl}`)
  process.exit(0)
}

function createTempHome() {
  const { mkdtempSync } = require('node:fs')
  return mkdtempSync(join(require('node:os').tmpdir(), 'dsh-smoke-'))
}
