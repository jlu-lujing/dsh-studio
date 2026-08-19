import test from 'node:test'
import assert from 'node:assert/strict'
import { ThemeStoreController } from '../src/webui/client/controller.ts'
import { BUILTIN_THEMES, saveStored } from '../src/webui/client/themes.ts'

function setup(hostThemes = []) {
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  }
  globalThis.fetch = async (url, opts) => {
    if (String(url).endsWith('/dsh-studio-webui/themes') && (opts === undefined || opts.method === undefined)) {
      return { ok: true, json: async () => ({ themes: hostThemes }) }
    }
    return { ok: true, json: async () => ({ ok: true }) }
  }
  const registered = []
  const overrides = []
  const themeCalls = []
  const service = {
    register: (t) => { registered.push(t.id); return () => {} },
    setTheme: (id) => themeCalls.push(id),
    getTheme: () => ({ preference: 'dark', active: { id: 'dark' } }),
    overrideTokens: (source, tokens) => { overrides.push({ source, tokens }); return () => {} },
  }
  return { mem, registered, overrides, themeCalls, service }
}

test('init：注册 预设+本地自定义+host 自定义，恢复 active，应用全局层', async () => {
  const s = setup([{ id: 'host-theme', name: 'Host', description: 'd', colorScheme: 'dark', builtin: false, tokens: { '--dsw-alias-bg-base': '#222' } }])
  saveStored({
    custom: [{ id: 'mine-dark', name: 'Mine', description: 'd', colorScheme: 'dark', builtin: false, tokens: { '--dsw-alias-bg-base': '#111' } }],
    active: 'ocean-dark',
    global: { '--dsw-alias-brand-primary': { light: '#123456', dark: '#abcdef' } },
  })
  const c = new ThemeStoreController(s.service)
  await c.init()
  assert.equal(s.registered.length, BUILTIN_THEMES.length + 2)
  assert.ok(s.registered.includes('mine-dark'))
  assert.ok(s.registered.includes('host-theme'))
  assert.equal(c.activeId, 'ocean-dark')
  // 新设计：预设主题落到官方基底 dark/light（themeCalls 是 dark/light），
  // 主题 token 经 override 层应用（ACTIVE_SOURCE）。
  assert.ok(s.themeCalls.includes('dark') || s.themeCalls.includes('light'))
  const activeOverride = s.overrides.find((o) => o.source === 'dsh-studio-webui.active')
  assert.ok(activeOverride, 'active override layer present')
  assert.equal(s.overrides[0].source, 'dsh-studio-webui.global')
  assert.deepEqual(s.overrides[0].tokens['--dsw-alias-brand-primary'], { light: '#123456', dark: '#abcdef' })
})

test('setGlobal：更新叠加层并持久化', async () => {
  const s = setup()
  saveStored({ custom: [], active: null, global: {} })
  const c = new ThemeStoreController(s.service)
  await c.init()
  c.setGlobal({ '--dsw-alias-label-primary': { light: '#000000', dark: '#ffffff' } })
  assert.deepEqual(s.overrides.at(-1).tokens['--dsw-alias-label-primary'], { light: '#000000', dark: '#ffffff' })
  assert.equal(c.globalTokens['--dsw-alias-label-primary'].dark, '#ffffff')
})

test('saveCustom：注册+持久化；与内置预设 id 冲突时拒绝', async () => {
  const s = setup()
  saveStored({ custom: [], active: null, global: {} })
  const c = new ThemeStoreController(s.service)
  await c.init()
  const theme = { id: 'new-dark', name: 'New', description: 'd', colorScheme: 'dark', builtin: false, tokens: { '--dsw-alias-bg-base': '#333' } }
  assert.equal(c.saveCustom(theme), true)
  assert.ok(s.registered.includes('new-dark'))
  assert.equal(c.themes.find((t) => t.id === 'new-dark').name, 'New')
  assert.equal(c.saveCustom({ ...theme, id: 'ocean-dark' }), false)
})

test('applyTheme/deleteCustom：切换并持久化；删除正在使用的主题回落官方 dark', async () => {
  const s = setup()
  saveStored({ custom: [{ id: 'new-dark', name: 'New', description: 'd', colorScheme: 'dark', builtin: false, tokens: { '--dsw-alias-bg-base': '#333' } }], active: null, global: {} })
  const c = new ThemeStoreController(s.service)
  await c.init()
  c.applyTheme('new-dark')
  assert.equal(c.activeId, 'new-dark')
  // 预设：setTheme 落官方基底(dark)，并加 override 层
  assert.equal(s.themeCalls.at(-1), 'dark')
  assert.ok(s.overrides.some((o) => o.source === 'dsh-studio-webui.active'))
  c.deleteCustom('new-dark')
  assert.equal(c.activeId, 'dark')
  assert.equal(s.themeCalls.at(-1), 'dark')
  assert.equal(c.themes.some((t) => t.id === 'new-dark'), false)
})
