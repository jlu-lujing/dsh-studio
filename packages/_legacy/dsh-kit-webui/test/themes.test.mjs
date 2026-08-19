import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_THEMES, TOKEN_FIELDS, TOKEN_GROUPS,
  DEFAULT_DARK_THEME_TOKENS, DEFAULT_LIGHT_THEME_TOKENS,
  loadStored, saveStored, setTokenMode, mixHex, alphaHex,
} from '../src/client/themes.ts'

function mockStorage() {
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  }
  return mem
}

test('内置预设：7 个家族 x 深/浅两版 = 14 个，token 为单值且字段完整', () => {
  assert.equal(BUILTIN_THEMES.length, 14)
  const families = new Set(BUILTIN_THEMES.map((t) => t.id.replace(/-(dark|light)$/, '')))
  assert.deepEqual([...families].sort(), ['forest', 'graphite', 'neon', 'ocean', 'sakura', 'solar', 'space'])
  for (const family of families) {
    assert.ok(BUILTIN_THEMES.some((t) => t.id === `${family}-dark` && t.colorScheme === 'dark'))
    assert.ok(BUILTIN_THEMES.some((t) => t.id === `${family}-light` && t.colorScheme === 'light'))
  }
  for (const t of BUILTIN_THEMES) {
    for (const f of TOKEN_FIELDS) {
      assert.equal(typeof t.tokens[f.name], 'string', `${t.id} 缺 ${f.name}`)
    }
    assert.ok(Object.values(t.tokens).every((v) => typeof v === 'string'))
  }
})

test('localStorage 持久化：自定义主题 + active + 全局层往返', () => {
  const mem = mockStorage()
  saveStored({
    custom: [{ id: 'mine-dark', name: 'Mine', description: 'd', colorScheme: 'dark', builtin: false, tokens: { '--dsw-alias-bg-base': '#111' } }],
    active: 'ocean-dark',
    global: { '--dsw-alias-brand-primary': { light: '#123456', dark: '#abcdef' } },
  })
  assert.equal(mem.size, 1)
  const back = loadStored()
  assert.equal(back.custom.length, 1)
  assert.equal(back.custom[0].id, 'mine-dark')
  assert.equal(back.active, 'ocean-dark')
  assert.deepEqual(back.global['--dsw-alias-brand-primary'], { light: '#123456', dark: '#abcdef' })
})

test('localStorage 损坏/空数据回退为安全默认', () => {
  const mem = mockStorage()
  mem.set('dsh-kit-webui.themes.v1', '{broken json')
  assert.deepEqual(loadStored(), { custom: [], active: null, global: {} })
  mem.set('dsh-kit-webui.themes.v1', JSON.stringify({ custom: [null], active: 3, global: { x: 'bad' } }))
  assert.deepEqual(loadStored(), { custom: [], active: null, global: {} })
})

test('setTokenMode：另一模式为空时回填同值，已有值保持不变', () => {
  const a = setTokenMode({}, '--dsw-alias-brand-primary', 'light', '#123456')
  assert.deepEqual(a['--dsw-alias-brand-primary'], { light: '#123456', dark: '#123456' })
  const b = setTokenMode(a, '--dsw-alias-brand-primary', 'dark', '#abcdef')
  assert.deepEqual(b['--dsw-alias-brand-primary'], { light: '#123456', dark: '#abcdef' })
})

test('token 目录分组：窗口 / 按钮与输入 / Markdown 与代码 / 状态', () => {
  const fields = (id) => TOKEN_GROUPS.find((g) => g.id === id)?.fields.map((f) => f.name) ?? []

  assert.ok(fields('window').includes('--dsw-alias-bg-base'))
  assert.ok(fields('window').includes('--dsw-specific-sidebar-fill'))
  assert.ok(fields('window').includes('--dsw-alias-scrollbar-bg-l1'))

  assert.ok(fields('controls').includes('--dsw-alias-button-primary-fill'))
  assert.ok(fields('controls').includes('--dsw-alias-button-ghost-active-hover'))
  assert.ok(fields('controls').includes('--dsw-specific-input-major'))
  assert.ok(fields('controls').includes('--dsw-alias-interactive-bg-hover'))

  assert.ok(fields('markdown').includes('--dsw-alias-markdown-code-block'))
  assert.ok(fields('markdown').includes('--dsw-alias-markdown-inline-code'))
  assert.ok(fields('markdown').includes('--shiki-token-comment'))
  assert.ok(fields('markdown').includes('--shiki-token-keyword'))
  assert.ok(fields('markdown').includes('--shiki-background'))

  assert.ok(fields('status').includes('--dsw-alias-state-error-primary'))
  assert.ok(fields('status').includes('--dsw-alias-state-business-primary'))

  // 所有组字段都被拍平进 TOKEN_FIELDS，且无重复
  assert.equal(TOKEN_FIELDS.length, TOKEN_GROUPS.reduce((n, g) => n + g.fields.length, 0))
  assert.equal(new Set(TOKEN_FIELDS.map((f) => f.name)).size, TOKEN_FIELDS.length)
})

test('预设已覆盖按钮 / 输入框 / Markdown / 代码：派生值与种子一致', () => {
  for (const t of BUILTIN_THEMES) {
    assert.equal(t.tokens['--dsw-alias-button-primary-fill'], t.tokens['--dsw-alias-brand-primary'])
    assert.equal(t.tokens['--dsw-alias-button-info-fill'], t.tokens['--dsw-alias-brand-primary'])
    assert.equal(t.tokens['--shiki-foreground'], t.tokens['--dsw-alias-label-primary'])
    assert.equal(t.tokens['--shiki-background'], t.tokens['--dsw-alias-markdown-code-block'])
    assert.equal(t.tokens['--dsw-alias-markdown-code-segment-unselected'], t.tokens['--dsw-alias-markdown-code-block'])
    assert.equal(typeof t.tokens['--dsw-specific-input-major'], 'string')
    assert.equal(typeof t.tokens['--dsw-alias-button-ghost-active-border'], 'string')
    assert.equal(typeof t.tokens['--dsw-specific-bubble-highlight'], 'string')
  }
})

test('侧边栏毛玻璃：透明度由 CSS 统一控制，种子 token 保持 hex', () => {
  for (const t of BUILTIN_THEMES) {
    const v = t.tokens['--dsw-specific-sidebar-fill']
    assert.match(v, /^#[0-9a-f]{6}$/i, `${t.id} sidebar fill 应保持 hex（玻璃透明度由 glass.ts 的 color-mix 控制）: ${v}`)
  }
  assert.match(DEFAULT_DARK_THEME_TOKENS['--dsw-specific-sidebar-fill'], /^#[0-9a-f]{6}$/i)
  assert.match(DEFAULT_LIGHT_THEME_TOKENS['--dsw-specific-sidebar-fill'], /^#[0-9a-f]{6}$/i)
})

test('编辑器默认配色覆盖全量字段（深色 / 浅色）', () => {
  for (const f of TOKEN_FIELDS) {
    assert.equal(typeof DEFAULT_DARK_THEME_TOKENS[f.name], 'string', `dark 缺 ${f.name}`)
    assert.equal(typeof DEFAULT_LIGHT_THEME_TOKENS[f.name], 'string', `light 缺 ${f.name}`)
  }
})

test('颜色工具：mixHex 与 alphaHex', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080')
  assert.equal(mixHex('#000000', '#ffffff', 0), '#000000')
  assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff')
  assert.match(alphaHex('#ff0000', 0.5), /^rgba\(255, 0, 0, 0\.5\)$/)
  assert.match(alphaHex('#112233', 0.08), /^rgba\(17, 34, 51, 0\.08\)$/)
})
