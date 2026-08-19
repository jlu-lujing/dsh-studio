/**
 * Preload：contextBridge 注入桌面信息（__DSH_DESKTOP__）与无边框窗口控制桥
 * （__dshDesktop.windowControl + __waitDshDesktop 就绪等待）。
 *
 * 上下文隔离开启，renderer 拿不到 Node；仅暴露只读元信息 + 窗口控制 IPC。
 *
 * 注意：sandbox preload 的 process polyfill 可能不完整，所有 process.* 访问
 * 必须 try/catch，否则一旦抛错会导致 contextBridge 后续全部不暴露
 * （表现为 dsh 页面里 __dshDesktop 为 undefined）。
 */
import { contextBridge, ipcRenderer } from 'electron'

function safeEnv(key: string): string {
  try {
    void process.env
    return (process.env[key] as string | undefined) ?? ''
  } catch {
    return ''
  }
}
function safePlatform(): string {
  try {
    return process.platform
  } catch {
    return ''
  }
}

contextBridge.exposeInMainWorld('__DSH_DESKTOP__', {
  version: safeEnv('DSH_DESKTOP_VERSION') || '0.0.0',
  platform: safePlatform(),
  dshUrl: safeEnv('DSH_WEB_URL'),
  runtimeVersion: safeEnv('DSH_RUNTIME_VERSION'),
})

// 无边框窗口控制桥（供注入的桌面 chrome 脚本调用）
const dshDesktop = {
  windowControl: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    // 多开：新开一个共享同一 dsh 后台的窗口（工具栏按钮 / 快捷键均走这里）
    newWindow: () => ipcRenderer.invoke('window:new-window'),
  },
  onMaximizedChange: (cb: (isMax: boolean) => void) => {
    ipcRenderer.on('window:maximized-changed', (_e, isMax: boolean) => cb(Boolean(isMax)))
  },
  /** 用 VS Code 打开指定目录（渲染层通过 __dshDesktop.openInVscode(path) 调用）。 */
  openInVscode: (path: string) => ipcRenderer.invoke('open-in-vscode', path),
  /** dsh 运行时版本 / 更新：设置页「dsh 版本」面板。 */
  runtime: {
    getVersion: () => ipcRenderer.invoke('dsh-runtime:get-version'),
    checkUpdate: () => ipcRenderer.invoke('dsh-runtime:check-update'),
  },
}

contextBridge.exposeInMainWorld('__dshDesktop', dshDesktop)

// 就绪等待：注入脚本可能在 preload 桥接后执行，也可能早期执行；提供等待函数
contextBridge.exposeInMainWorld('__waitDshDesktop', (cb: (api: typeof dshDesktop) => void) => {
  cb(dshDesktop)
})
