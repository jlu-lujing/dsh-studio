import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'out')

test('a runtime zip was produced for this platform', () => {
  const files = existsSync(out) ? readdirSync(out) : []
  const zips = files.filter((f) => f.startsWith('dsh-runtime-') && f.endsWith('.zip') && !f.includes('.tmp-'))
  assert.ok(zips.length >= 1, `expected at least one zip in ${out}, got: ${files.join(', ')}`)
})

test('produced zip name matches this platform/arch convention', () => {
  const files = existsSync(out) ? readdirSync(out) : []
  const zips = files.filter((f) => f.startsWith('dsh-runtime-') && f.endsWith('.zip') && !f.includes('.tmp-'))
  if (zips.length === 0) return // allow out/ absent on fresh CI
  const expected = `dsh-runtime-0.1.0-rc.6-${process.platform}-${process.arch}.zip`
  assert.ok(zips.includes(expected), `expected ${expected} in ${zips.join(', ')}`)
})
