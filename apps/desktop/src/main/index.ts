/**
 * DSH Studio Desktop — Electron 壳主进程。
 *
 * 流程（docs/DESKTOP.md §6）：
 *   应用启动 → 单实例锁 → 解析 dsh-runtime → 探测已有健康 dsh 实例（复用）
 *   → 否则 spawn 自己的 dsh（web --port 0）→ 等待 ready 行 → BrowserWindow.loadURL
 *   → 运行期仅放行同 origin → 退出时优雅停掉自管 dsh 子进程（external 实例不杀）。
 */

import { app, BrowserWindow, shell, dialog, Tray, ipcMain, screen, Menu } from 'electron'
import type { Rectangle } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DESKTOP_CHROME_CSS, DESKTOP_CHROME_JS } from './desktop-chrome'
import {
  type DshProcess,
  buildSpawn,
  resolveRuntime,
  spawnWebAndWait,
  stopWeb,
} from './runtime'
import {
  applyUpdate,
  fetchFeed,
  type UpdateListener,
} from './updater'
import { applyAutostart, createTray, windowIconPath, appVersion } from './app-features'
import { ensureFamilyInstalled } from './plugins'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // 已有壳实例在运行：聚焦那个窗口后退出本实例。
  app.quit()
}

// 开发期调试：DSH_DESKTOP_REMOTE_DEBUG=1 时给 Chromium 开 9223 调试端口，
// 便于用 CDP 连接真实 Electron 页面（排查主题/渲染问题时用）。
if (process.env.DSH_DESKTOP_REMOTE_DEBUG === '1') {
  app.commandLine.appendSwitch('remote-debugging-port', '9223')
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

/** 本次壳管理的 dsh 子进程（external 时为 null → 退出不杀） */
let managed: DshProcess | null = null
/** 所有打开的窗口（多开：共享同一个 dsh 后台，各自独立 UI 状态）。 */
const windows = new Set<BrowserWindow>()
let tray: Tray | null = null
let dshUrl: string | null = null

/** 手动维护的最大化状态（transparent frameless 下 win.isMaximized() 不可靠）。
 *  多开场景每窗口独立维护，避免��相串状态。 */
const manualMaximized = new WeakMap<BrowserWindow, boolean>()
/** 最大化前的正常窗口 bounds（手动恢复用），每窗口独立。 */
const normalBoundsByWin = new WeakMap<BrowserWindow, Rectangle>()

function sendMaximizedState(win: BrowserWindow, isMax: boolean): void {
  manualMaximized.set(win, isMax)
  if (!win.isDestroyed()) win.webContents.send('window:maximized-changed', isMax)
}
function isMaxed(win: BrowserWindow): boolean {
  return manualMaximized.get(win) ?? false
}

/** 用户数据目录（默认 ~/.dsh，与 CLI 共享 profile/插件/会话） */
function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 应用日志目录，dsh 日志落盘便于排障 */
function logDir(): string {
  const dir = app.getPath('userData')
  try { mkdirSync(dir, { recursive: true }) } catch { /* 忽略 */ }
  return dir
}

function appendLog(line: string): void {
  try {
    writeFileSync(join(logDir(), 'desktop.log'), `${new Date().toISOString()} ${line}\n`, { flag: 'a' })
  } catch { /* 忽略 */ }
}

/** 新建一个窗口（多开：所有窗口共享同一 dsh 后台，各自独立 UI 状态）。
 *
 * 无边框策略（为同时拿到系统窗口能力 + 自绘外观）：
 *   - **不透明**（去掉 transparent）：恢复系统边缘缩放 / Windows Aero Snap /
 *     shadow；视觉圆角由 #root 的 border-radius + overflow:hidden 保持。
 *   - **macOS**：titleBarStyle:'hidden' → 系统仍管理标题栏，原生红绿灯 +
 *     全屏/分屏/双击最大化回归；trafficLightPosition 把灯放到左上角想要的位置。
 *   - **Windows/Linux**：frame:false（无系统边框）+ 自绘右上角按钮；
 *     非透明时系统保留 8px 边缘 resize 热区 + Aero Snap。
 */
function createWindow(url: string): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    // 最小窗口尺寸：允许缩得更窄（360px），窄窗口下布局自动收窄/滚动
    minWidth: 360,
    minHeight: 620,
    show: false,
    frame: false,
    // 关键：不透明。无边框 + 不透明才能保留系统缩放与贴靠；
    // 圆角由注入 CSS（#root border-radius + overflow:hidden）呈现。
    transparent: false,
    hasShadow: true,
    roundedCorners: true,
    ...(isMac
      ? {
          // macOS：隐藏系统标题栏但保留系统窗口管理（红绿灯/全屏/双击）
          titleBarStyle: 'hidden' as const,
          // mac 信号灯垂直对齐 logo（titlebar 高 60 居中 → 灯中心 30px，顶部取 24）
          trafficLightPosition: { x: 14, y: 24 },
        }
      : {
          // Windows/Linux：完全无边框，自绘右上角按钮
          titleBarStyle: undefined,
        }),
    title: `DSH Studio v${appVersion()}`,
    icon: windowIconPath(), // 非 darwin 平台窗口图标
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  windows.add(win)

  win.once('ready-to-show', () => {
    if (windows.has(win)) win.show()
  })
  void win.loadURL(url)

  // 窗口最大化状态变化 → 通知 renderer（切换按钮图标 / 取消圆角）
  win.on('maximize', () => { if (windows.has(win)) sendMaximizedState(win, true) })
  win.on('unmaximize', () => { if (windows.has(win)) sendMaximizedState(win, false) })

  // 导航仅放行同 origin；外部链接交给系统浏览器。
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (externalNav(targetUrl)) {
      void shell.openExternal(targetUrl)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (externalNav(targetUrl)) {
      event.preventDefault()
      void shell.openExternal(targetUrl)
    }
  })

  // 页面加载后注入无边框 chrome（圆角 / 拖拽 / 右上角窗口控制 / Session log 左移）
  win.webContents.on('did-finish-load', () => {
    injectDesktopChrome(win)
  })

  win.on('closed', () => {
    windows.delete(win)
    manualMaximized.delete(win)
    normalBoundsByWin.delete(win)
  })
  return win
}

/** 显式新开一个窗口（工具栏按钮 / 快捷键触发）。 */
function openNewWindow(): BrowserWindow {
  const url = dshUrl
  if (!url) {
    // dsh 还没就绪：尝试聚焦已有窗口即可
    const existing = [...windows].find((w) => !w.isDestroyed())
    if (existing) { existing.focus(); return existing }
    return createWindow('about:blank')
  }
  return createWindow(url)
}

/** 向 dsh web UI 页面注入无边框窗口自绘 chrome（CSS + 控制按钮）。 */
function injectDesktopChrome(win: BrowserWindow | null): void {
  if (!win) return
  const wc = win.webContents
  // 单次注入：CSS 直接内联，避免两次 executeJavaScript 之间竞态
  // （第二次可能读到 __DSH_DESKTOP_CHROME_CSS__ 为 undefined → 样式缺失 → 控件错位）。
  const javaScript =
    'window.__DSH_DESKTOP_CHROME_CSS__ = ' + JSON.stringify(DESKTOP_CHROME_CSS) +
    '; if (!window.__dshKitDesktopChrome__) {' + DESKTOP_CHROME_JS + '}'
  wc.executeJavaScript(javaScript, true)
    .catch((err) => {
      console.warn('[desktop-chrome] inject failed:', err)
    })
}

/** 注册无边框窗口控制 IPC（min / toggleMaximize / close / isMaximized）。 */
function registerWindowControls(): void {
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    // Windows transparent frameless 窗口：win.isMaximized() 恒为 false、
    // win.unmaximize() 无效。改为手动保存/恢复 bounds（标准 workaround）。
    if (isMaxed(win)) {
      const target = normalBoundsByWin.get(win) ?? { x: 100, y: 100, width: 1280, height: 820 }
      normalBoundsByWin.delete(win)
      win.setBounds(target)
      sendMaximizedState(win, false)
      return false
    }
    const bounds = win.getBounds()
    normalBoundsByWin.set(win, bounds)
    const display = screen.getDisplayMatching(bounds)
    win.setBounds(display.workArea)
    sendMaximizedState(win, true)
    return true
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:is-maximized', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return win ? isMaxed(win) : false
  })

  // 多开：新开一个窗口（工具栏按钮 / 快捷键 / preload 桥）。
  ipcMain.handle('window:new-window', () => {
    openNewWindow()
    return true
  })


  // 用 VS Code 打开指定目录：优先 code/code.cmd，失败回退文件管理器
  // spawn 的启动失败是异步 error 事件，必须用 Promise + child.on('error') 接住，
  // 否则会变成主进程 uncaught exception（spawn ENOENT）。
  const openWithSpawn = (bin: string, path: string): Promise<boolean> =>
    new Promise((resolve) => {
      const child = spawn(bin, [path], {
        // Windows 下 code.cmd 是批处理，必须 shell:true 才能经 PATHEXT 找到；
        // 非 Win 平台用 shell:false 直跑可执行文件。
        shell: process.platform === 'win32',
        detached: true,
        stdio: 'ignore',
      })
      child.once('error', () => resolve(false))
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })
    })

  ipcMain.handle('open-in-vscode', async (_e, path) => {
    if (typeof path !== 'string' || path === '') return { ok: false, error: 'empty path' }
    const candidates = process.platform === 'win32'
      ? ['code.cmd', 'code']
      : ['code']
    for (const bin of candidates) {
      const ok = await openWithSpawn(bin, path)
      if (ok) return { ok: true, bin }
    }
    try {
      if (process.platform === 'win32') await shell.openPath(path)
      return { ok: false, error: 'vscode not found' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // ── dsh 版本检查 / 更新（设置页「dsh 版本」面板用） ──
  ipcMain.handle('dsh-runtime:get-version', async () => {
    const current = (() => {
      try {
        const meta = resolveRuntime(app.getPath('userData'))?.meta
        return meta?.dshVersion ?? null
      } catch { return null }
    })()
    let feedLatest: string | null = null
    let feedUrl = ''
    try {
      feedUrl = updateFeedUrl()
      const feed = await fetchFeed(feedUrl)
      feedLatest = feed.dshVersion
    } catch { /* feed 拿不到就只给当前 */ }
    return { current, feedLatest, feedUrl }
  })

  ipcMain.handle('dsh-runtime:check-update', async () => {
    // 触发后台完整更新链路；结果经 appendLog 记录（设置页刷新 get-version 看结果）。
    void checkForUpdates()
    return { started: true }
  })
}

/** 只放行同 origin（当前 dsh loopback URL）；其余一律当作外部链接 */
function externalNav(targetUrl: string): boolean {
  if (!dshUrl) return true
  try {
    return new URL(targetUrl).origin !== new URL(dshUrl).origin
  } catch {
    return true
  }
}

function isAutoStartSuffix(): string {
  return process.env.DSH_DESKTOP_NO_AUTOSTART === '1' ? ' (autostart off)' : ''
}

/** 当存在托盘且非显式退出时，关闭窗口应驻留后台不退出。 */
function hasTrayStay(): boolean {
  return tray !== null && !(app as DeepSeekApp).isQuiting
}

/** 带自定义标志的 app 类型（isQuiting 由我们维护） */
interface DeepSeekApp {
  isQuiting?: boolean
}

/** 创建托盘（幂等），托盘菜单：显示窗口 / 检查更新 / 退出。 */
function ensureTray(): void {
  if (tray) return
  tray = createTray({
    onShow: () => {
      const alive = [...windows].filter((w) => !w.isDestroyed())
      const target = alive[alive.length - 1] ?? alive[0]
      if (target) {
        if (target.isMinimized()) target.restore()
        target.show()
        target.focus()
      } else if (dshUrl) {
        createWindow(dshUrl)
      }
    },
    onCheckUpdate: () => { void checkForUpdates() },
    onQuit: () => {
      (app as DeepSeekApp).isQuiting = true
      app.quit()
    },
  })
}

async function boot(): Promise<void> {
  appendLog(`boot: starting, dshHome=${dshHome()}${isAutoStartSuffix()}`)

  // 0) 开机自启（默认开；环境变量可关） + 托盘
  try { applyAutostart(true) } catch { /* 忽略 */ }
  ensureTray()

  // 1) 定位 dsh-runtime
  const runtime = resolveRuntime(app.getPath('userData'))
  if (!runtime) {
    appendLog('boot: no dsh-runtime found')
    dialog.showErrorBox(
      'dsh-runtime 缺失',
      '未找到内置 dsh 运行时（node_modules/@deepseek-ai/dsh 不存在）。\n' +
      '请用 apps/dsh-runtime 构建 runtime 并放入 resources/dsh-runtime 或用户数据目录。',
    )
    app.quit()
    return
  }
  appendLog(`boot: runtime dir=${runtime.dir}, dsh=${runtime.meta.dshVersion ?? '?'}`)

  // 2) 探测已有健康 dsh 实例（默认 3080）——复用则不自己拉起
  const existingUrl = await probeExisting()
  if (existingUrl) {
    dshUrl = existingUrl
    createWindow(existingUrl)
    appendLog(`boot: reusing existing dsh at ${existingUrl}`)
    return
  }

  // 3) spawn 自己的 dsh
  try {
    const spawnBase = buildSpawn(runtime.dir, runtime.meta, dshHome())
    appendLog(`boot: spawning dsh web (node=${spawnBase.nodeBin})`)
    const { child, url, log } = await spawnWebAndWait(spawnBase, { timeoutMs: 30_000 })
    managed = { child, external: false, url }
    dshUrl = url
    appendLog(`boot: dsh ready at ${url}`)
    log.forEach((l) => appendLog(`dsh: ${l.trim()}`))

    // 自管实例就绪后，后台保证 web profile 里已装 dsh-studio（开箱即用）。
    // 仅自管实例触发：复用外部 3080 时不干预用户已有实例。
    ensureFamilyInstalled(spawnBase.nodeBin, spawnBase.dshBin, {
      profile: 'web',
      dshHome: dshHome(),
      profilesDir: join(dshHome(), 'profiles'),
      runtimeDir: runtime.dir,
      log: (l) => appendLog(l),
    })

    createWindow(url)
    // 启动成功后后台非阻塞检查更新（失败只记录，不影响使用）
    checkForUpdates()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendLog(`boot: spawn failed: ${msg}`)
    // 打磨的错误页：加载 renderer 启动页并把错误写入 query
    showErrorPage(msg)
  }
}

/** 展示启动失败错误页（renderer），并保留进程供用户看日志/重试。
 *  错误页为独立单窗（不参与多开），避免与 dsh 窗口混用。 */
function showErrorPage(message: string): void {
  try {
    let errWin = [...windows].find((w) => w.getTitle().includes('启动失败'))
    if (!errWin) {
      errWin = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 360,
        minHeight: 620,
        show: false,
        // 与主窗口一致的无边框 + 圆角
        frame: false,
        transparent: true,
        hasShadow: true,
        roundedCorners: true,
        title: 'DSH Studio — 启动失败',
        icon: windowIconPath(),
        webPreferences: {
          preload: join(__dirname, '../preload/index.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      windows.add(errWin)
      errWin.once('ready-to-show', () => errWin?.show())
      errWin.on('closed', () => windows.delete(errWin!))
    }
    void errWin.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { error: message },
    })
  } catch (pageErr) {
    // 页面加载也失败时，退回系统错误框
    dialog.showErrorBox('dsh 启动失败', message)
  }
}

  /** 更新 feed 的默认地址：优先环境变量（本地测试 file:），否则 GitHub Releases。
   *  feed.json 由 apps/dsh-runtime/scripts/release.mjs 生成并随 Release 上传。 */
  function updateFeedUrl(): string {
  return (
    process.env.DSH_DESKTOP_FEED_URL ??
    'https://github.com/jlu-lujing/dsh-studio/releases/latest/download/feed.json'
  )
}

/**
 * 后台检查更新：拉 feed → 有新版本则走完整更新链路（下载→校验→解压→冒烟→
 * 停旧→切换→重启→失败回滚）。用之内的 listener 记录日志/通知。
 */
async function checkForUpdates(): Promise<void> {
  const currentDir = resolveRuntime(app.getPath('userData'))?.dir
  // 只有自管 dsh 时才自动更新（external 复用不干预用户自己的实例）
  if (!managed || managed.external) return

  const listener: UpdateListener = (stage, detail) => {
    appendLog(`update: ${stage}${detail ? ` — ${detail}` : ''}`)
  }

  try {
    listener('检查更新', updateFeedUrl())
    const feed = await fetchFeed(updateFeedUrl())

    // 与当前运行时版本比较：相同/更低则跳过
    const nowMeta = managed ? resolveRuntime(app.getPath('userData'))?.meta : undefined
    if (nowMeta?.dshVersion && nowMeta.dshVersion === feed.dshVersion) {
      listener('已是最新', feed.dshVersion)
      return
    }

    listener('发现新版本', feed.dshVersion)
    const { managed: nextManaged, url } = await applyUpdate({
      userDataDir: app.getPath('userData'),
      feedUrl: updateFeedUrl(),
      dshHome: dshHome(),
      current: { dir: currentDir ?? '', child: managed?.child ?? null },
      desktopVersion: app.getVersion(),
      listener,
    })
    // 更新成功：替换壳状态并让窗口加载新 dsh URL
    managed = nextManaged
    dshUrl = url
    // 多开：让所有窗口都加载新 dsh URL；没有窗口则新建一个。
    const alive = [...windows].filter((w) => !w.isDestroyed() && !w.getTitle().includes('启动失败'))
    if (alive.length === 0) {
      createWindow(url)
    } else {
      for (const w of alive) void w.loadURL(url)
    }
    appendLog(`update: applied, now running dsh ${nextManaged.url}`)
  } catch (err) {
    listener('更新失败', err instanceof Error ? err.message : String(err))
  }
}

/**
 * 探测 127.0.0.1:<port> 是否已有健康 dsh 服务。
 * 默认端口 3080；可用环境变量 DSH_DESKTOP_PROBE_PORT 覆盖（测试/自定义端口）。
 */
async function probeExisting(): Promise<string | null> {
  const port = process.env.DSH_DESKTOP_PROBE_PORT ?? '3080'
  const url = `http://127.0.0.1:${port}`
  try {
    const res = await fetch(url)
    if (res.ok) return url
  } catch {
    // 无监听
  }
  return null
}

/** 退出：stopWeb 自管 dsh（external 不杀） */
function shutdown(): void {
  appendLog('shutdown: stopping managed dsh')
  if (managed && !managed.external) stopWeb(managed.child)
}

// 单实例：第二个实例触发此回调 → 聚焦最近打开的窗口（多开时聚焦一个即可）
app.on('second-instance', () => {
  const alive = [...windows].filter((w) => !w.isDestroyed() && !w.getTitle().includes('启动失败'))
  const target = alive[alive.length - 1] ?? alive[0]
  if (target) {
    if (target.isMinimized()) target.restore()
    target.focus()
  }
})

app.on('window-all-closed', () => {
  // 有托盘时关闭窗口不退出（驻留后台）；真正退出走托盘菜单/系统退出。
  if (process.platform !== 'darwin' && !hasTrayStay()) app.quit()
})

app.on('activate', () => {
  if (dshUrl && [...windows].filter((w) => !w.isDestroyed()).length === 0) createWindow(dshUrl)
})

app.on('before-quit', () => {
  (app as DeepSeekApp).isQuiting = true
  shutdown()
})

app.on('will-quit', () => {
  tray?.destroy()
  tray = null
})

if (gotLock) {
  registerWindowControls()
  void app.whenReady().then(() => {
    // 多开快捷键：CmdOrCtrl+N 新开一个共享同一 dsh 后台的窗口。
    const template: Electron.MenuItemConstructorOptions[] = [{
      label: '文件',
      submenu: [{
        label: '新窗口',
        accelerator: 'CmdOrCtrl+N',
        click: () => openNewWindow(),
      }],
    }]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
    void boot()
  })
}
