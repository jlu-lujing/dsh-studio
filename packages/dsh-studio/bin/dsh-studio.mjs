#!/usr/bin/env node
/** dsh-studio CLI: one-command family install + per-feature on/off without editing patches. */

import { spawnSync } from 'node:child_process'

import { createStore } from '../lib/state.js'
import { FEATURES } from '../lib/store.js'

const args = process.argv.slice(2)
const [cmd] = args

const defaults = Object.fromEntries(FEATURES.map(f => [f.id, f.defaultEnabled ?? true]))

if (cmd === undefined || cmd === 'list' || cmd === 'status' || cmd === 'ls') {
  const store = createStore(undefined, defaults)
  store.load()
  for (const f of FEATURES) {
    const enabled = store.isEnabled(f.id)
    console.log(`${enabled ? 'on ' : 'off'}  ${f.id.padEnd(22)} ${f.name} — ${f.description}`)
  }
  process.exit(0)
}

if (cmd === 'enable' || cmd === 'disable') {
  const id = args[1]
  if (id === undefined) {
    console.error(`dsh-studio: usage: dsh-studio ${cmd} <feature>`)
    process.exit(1)
  }
  if (!FEATURES.some(f => f.id === id)) {
    console.error(`dsh-studio: unknown feature "${id}". Known: ${FEATURES.map(f => f.id).join(', ')}`)
    process.exit(1)
  }
  const store = createStore(undefined, defaults)
  store.load()
  store.setEnabled(id, cmd === 'enable')
  console.log(`dsh-studio: ${id} ${cmd}d`)
  process.exit(0)
}

if (cmd === 'install') {
  // Install the whole family into a profile. This command only makes sense on
  // a system that ALREADY has the `dsh-studio` CLI installed (its bin is on
  // PATH) — a brand-new machine must first add dsh-studio itself via:
  //   dsh plugin --profile <name> add -w dsh-studio
  // Under the hood this is exactly that same command: dsh-studio declares the
  // four feature packages as npm dependencies (hoisted into the profile), and
  // the 满血模式 preset is bundled inside dsh-studio (no separate package).
  //   dsh-studio install [--profile <name>] [extra add flags...]
  const rest = args.slice(1)
  let profile = 'web'
  const passthrough = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--profile') { profile = rest[++i]; continue }
    passthrough.push(a)
  }
  const dshArgs = ['plugin', '--profile', profile, 'add', '-w', ...passthrough, 'dsh-studio']
  console.log(`dsh-studio: installing family into profile "${profile}": dsh-studio + 4 feature deps`)
  const res = spawnSync('dsh', dshArgs, { stdio: 'inherit' })
  process.exit(res.status ?? 1)
}

console.error(`dsh-studio: unknown command "${cmd ?? ''}". Usage: dsh-studio [list|status|ls|install [--profile <name>]|enable <feature>|disable <feature>]`)
process.exit(1)
