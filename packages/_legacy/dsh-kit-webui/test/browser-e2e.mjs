#!/usr/bin/env node
/**
 * dsh-kit-webui 主题商店 —— 真实浏览器 E2E。
 *
 * 前置：
 *   1. 已按 README 把 dsh-kit 全家桶 6 个包 link 进一个隔离 DSH_HOME 的 web profile；
 *   2. 该 profile 的 dsh web 已启动（默认 http://127.0.0.1:3199）；
 *   3. 本机 Chrome/Edge 以 CDP 模式启动：
 *        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  *          --headless=new --remote-debugging-port=9223  *          --user-data-dir=/tmp/dsh-chrome-profile about:blank
 *
 * 运行：
 *   cd packages/dsh-kit-webui
 *   pnpm test:e2e
 *
 * 可用环境变量：DSH_URL（默认 http://127.0.0.1:3199）、CDP_HTTP（默认 http://127.0.0.1:9223）。
 */
const DSH_URL = process.env.DSH_URL ?? 'http://127.0.0.1:3199/'
const CDP_HTTP = process.env.CDP_HTTP ?? 'http://127.0.0.1:9223'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const targets = await fetch(`${CDP_HTTP}/json`).then((res) => res.json())
const target = targets.find((t) => t.type === 'page')
if (!target) throw new Error(`no page target at ${CDP_HTTP}/json`)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const pending = new Map()
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
  }
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
const poll = async (fn, description, timeout = 20000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { const value = await fn(); if (value) return value } catch {}
    await sleep(300)
  }
  throw new Error(`timeout: ${description}`)
}
const cssVar = (name) => `getComputedStyle(document.body).getPropertyValue('${name}').trim()`

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: DSH_URL })

await poll(async () => await evaluate(`document.readyState === 'complete' && typeof window.__DSH_BOOT__ !== 'undefined'`), 'boot graph')
const entry = await evaluate(`window.__DSH_BOOT__.entries.find(e => e.id === 'dsh-kit-webui')`)
if (!entry || !entry.inject.includes('@deepseek-ai/dsh-client-ui-theme')) {
  throw new Error('boot entry or ui-theme edge missing')
}
console.log('1) boot entry ok:', JSON.stringify(entry))

await poll(async () => await evaluate(`document.querySelector('button[aria-haspopup="dialog"]') !== null`), 'settings trigger')
await evaluate(`document.querySelector('button[aria-haspopup="dialog"]').click(); true`)
await poll(async () => await evaluate(`document.body.innerText.includes('主题商店')`), 'theme store nav')
await evaluate(`(() => { const els=[...document.querySelectorAll('button,li,div,span')]; const el=els.find(e => e.textContent.trim()==='主题商店' && e.children.length===0); el.click(); return true })()`)
await poll(async () => await evaluate(`document.body.innerText.includes('全局界面调整') && document.body.innerText.includes('主题风格 · 预设')`), 'theme store panel')
console.log('2) 面板两部分已渲染')

const presetNames = ['海洋 Ocean · 深色', '海洋 Ocean · 浅色', '樱 Sakura · 深色', '樱 Sakura · 浅色', '森林 Forest · 深色', '森林 Forest · 浅色']
const bodyText = await evaluate(`document.body.innerText`)
for (const name of presetNames) if (!bodyText.includes(name)) throw new Error(`preset missing: ${name}`)
console.log('3) 6 个深浅预设全部显示')

await evaluate(`(() => { const card=[...document.querySelectorAll('div')].find(e => e.textContent.includes('海洋 Ocean · 深色') && e.querySelector('button')); const btn=[...card.querySelectorAll('button')].find(b => b.textContent.includes('应用这个主题')); btn.click(); return true })()`)
await poll(async () => await evaluate(cssVar('--dsw-alias-bg-base')) === '#0b1220', 'ocean-dark css')
console.log('4) ocean-dark 实际 CSS token = #0b1220')

await evaluate(`(() => { const card=[...document.querySelectorAll('div')].find(e => e.textContent.includes('海洋 Ocean · 浅色') && e.querySelector('button')); const btn=[...card.querySelectorAll('button')].find(b => b.textContent.includes('应用这个主题')); btn.click(); return true })()`)
await poll(async () => await evaluate(cssVar('--dsw-alias-bg-base')) === '#f4f8fc', 'ocean-light css')
console.log('5) ocean-light 实际 CSS token = #f4f8fc')

const ok = await evaluate(`(() => {
  const label=[...document.querySelectorAll('label')].find(l => l.textContent.trim()==='品牌强调');
  if (!label) return false;
  const input=label.closest('div').querySelectorAll('input[type="color"]')[0];
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  setter.call(input,'#112233');
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
})()`)
if (!ok) throw new Error('global color input not found')
await poll(async () => await evaluate(cssVar('--dsw-alias-brand-primary')) === '#112233', 'global overlay css')
const stored = await evaluate(`JSON.parse(localStorage.getItem('dsh-kit-webui.themes.v1') || '{}').global['--dsw-alias-brand-primary']`)
if (!stored || stored.light !== '#112233') throw new Error('global overlay not persisted')
console.log('6) 全局调整已叠加并持久化:', JSON.stringify(stored))

console.log('BROWSER-E2E-OK')
ws.close()
