/**
 * preset.ts 单元测试：Boost Mode + J-Space Mode 双模式安装/卸载/幂等。
 * 用临时 home 目录验证，不碰真实 ~/.dsh。
 */
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PRESETS, PRESET_ID, presetSourceDir, presetTargetDir, isInstalled,
  installPreset, uninstallPreset,
} from '../src/preset.ts'

function tmpHome(label) {
  const dir = mkdtempSync(join(tmpdir(), `dsh-studio-preset-${label}-`))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('PRESET_ID 默认 boost-mode；注册表含两个模式', () => {
  assert.equal(PRESET_ID, 'boost-mode')
  assert.deepEqual(Object.keys(PRESETS).sort(), ['boost-mode', 'jspace-mode'])
})

test('两模式源目录都存在且完整', () => {
  for (const id of Object.keys(PRESETS)) {
    const src = presetSourceDir(id)
    assert.ok(existsSync(join(src, 'agent.cordis.yml')), `${id}: agent.cordis.yml`)
    assert.ok(existsSync(join(src, 'preset.yml')), `${id}: preset.yml`)
  }
})

test('jspace-mode 内联 j-space 完整', () => {
  const src = presetSourceDir('jspace-mode')
  assert.ok(existsSync(join(src, 'j-space', 'SKILL.md')), 'j-space/SKILL.md')
  assert.ok(existsSync(join(src, 'inline-jspace.mjs')), 'inline-jspace.mjs')
})

test('安装/卸载 boost-mode 到临时 home，幂等且不覆盖已存在目录', () => {
  const { dir, cleanup } = tmpHome('boost')
  try {
    const target = presetTargetDir('boost-mode', dir)
    const r1 = installPreset({ id: 'boost-mode', home: dir })
    assert.equal(r1.installed, true)
    assert.ok(existsSync(join(target, 'agent.cordis.yml')))
    assert.ok(isInstalled({ id: 'boost-mode', home: dir }))

    // 幂等：已完整安装 → skipped already-installed，不覆盖
    const r2 = installPreset({ id: 'boost-mode', home: dir })
    assert.equal(r2.installed, false)
    assert.equal(r2.skipped, 'already-installed')

    // 卸载
    const u = uninstallPreset({ id: 'boost-mode', home: dir })
    assert.equal(u.removed, true)
    assert.ok(!isInstalled({ id: 'boost-mode', home: dir }))
  } finally {
    cleanup()
  }
})

test('安装/卸载 jspace-mode 到临时 home，内联 j-space 随 preset 落位', () => {
  const { dir, cleanup } = tmpHome('jspace')
  try {
    const target = presetTargetDir('jspace-mode', dir)
    const r = installPreset({ id: 'jspace-mode', home: dir })
    assert.equal(r.installed, true)
    assert.ok(existsSync(join(target, 'j-space', 'SKILL.md')), '内联 j-space/SKILL.md 已落位')
    assert.ok(existsSync(join(target, 'inline-jspace.mjs')), 'inline-jspace.mjs 已落位')
    assert.ok(!existsSync(resolve(join(dir, 'skills', 'j-space'))), '不触碰 ~/.dsh/skills')

    const u = uninstallPreset({ id: 'jspace-mode', home: dir })
    assert.equal(u.removed, true)
  } finally {
    cleanup()
  }
})

test('两模式互不影响（分别安装/分别卸载）', () => {
  const { dir, cleanup } = tmpHome('both')
  try {
    installPreset({ id: 'boost-mode', home: dir })
    installPreset({ id: 'jspace-mode', home: dir })
    assert.ok(isInstalled({ id: 'boost-mode', home: dir }))
    assert.ok(isInstalled({ id: 'jspace-mode', home: dir }))

    uninstallPreset({ id: 'boost-mode', home: dir })
    assert.ok(!isInstalled({ id: 'boost-mode', home: dir }))
    assert.ok(isInstalled({ id: 'jspace-mode', home: dir }), 'jspace-mode 不受影响')
  } finally {
    cleanup()
  }
})
