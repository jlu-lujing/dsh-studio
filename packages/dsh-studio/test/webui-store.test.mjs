import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadThemes, saveThemes } from '../src/webui/store.ts'

test('host 主题 JSON 往返', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-studio-webui-test-'))
  try {
    const themes = [{ id: 'test-dark', name: '测试', description: 'd', colorScheme: 'dark', builtin: false, tokens: { '--dsw-alias-bg-base': '#000' } }]
    saveThemes(dir, themes)
    assert.deepEqual(loadThemes(dir), themes)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('host 主题文件缺失返回空数组', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-studio-webui-test-'))
  try {
    assert.deepEqual(loadThemes(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
