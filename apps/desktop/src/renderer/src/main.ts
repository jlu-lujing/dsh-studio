/**
 * Renderer 入口：启动页 / 错误页 / 状态页。
 *
 * 正常情况下 main 会在 dsh 就绪后 loadURL 覆盖本页（真正的 dsh UI）；本页作为
 * 启动兜底与错误展示。main 启动失败时可用 loadFile(out/renderer/index.html,
 * { query: { error } }) 让这里展示失败原因。
 *
 * 从 URL query 读取 `error`（若有则显示错误页），否则显示“正在启动”+ 爪印 logo。
 */

const LOGO_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iNTAuMDAwMDAwIiBoZWlnaHQ9IjUwLjAwMDAwMCIgdmlld0JveD0iMCAwIDUwIDUwIiBmaWxsPSJub25lIj4KCTxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik00OC44MzU0IDEwLjA0NzlDNDguMzIzMiA5Ljc5MTk5IDQ4LjEwMjUgMTAuMjc5OCA0Ny44MDMyIDEwLjUyNzhDNDcuNzAwNyAxMC42MDc5IDQ3LjYxNDMgMTAuNzExOSA0Ny41MjczIDEwLjgwNzZDNDYuNzc5MyAxMS42MjQgNDUuOTA0OCAxMi4xNTk3IDQ0Ljc2MjIgMTIuMDk1N0M0My4wOTIzIDEyIDQxLjY2NiAxMi41MzU2IDQwLjQwNTggMTMuODM5OEM0MC4xMzc3IDEyLjIzMTkgMzkuMjQ3NiAxMS4yNzIgMzcuODkyNiAxMC42NTU4QzM3LjE4MzYgMTAuMzM1OSAzNi40NjY4IDEwLjAxNTYgMzUuOTcwMiA5LjMxOTgyQzM1LjYyMzUgOC44MjM3MyAzNS41MjkzIDguMjcxOTcgMzUuMzU2IDcuNzI3NTRDMzUuMjQ1NiA3LjM5OTkgMzUuMTM1MyA3LjA2Mzk2IDM0Ljc2NTEgNy4wMDc4MUMzNC4zNjMzIDYuOTQzODUgMzQuMjA1NiA3LjI4NzYgMzQuMDQ3OSA3LjU3NTY4QzMzLjQxOCA4Ljc1MTk1IDMzLjE3MzMgMTAuMDQ3OSAzMy4xOTczIDExLjM1OTlDMzMuMjUyNCAxNC4zMTIgMzQuNDczNiAxNi42NjQxIDM2Ljg5OTkgMTguMzM1OUMzNy4xNzU4IDE4LjUyNzggMzcuMjQ2NiAxOC43MTk3IDM3LjE1OTcgMTlDMzYuOTk0NiAxOS41NzU3IDM2Ljc5NzQgMjAuMTM1NyAzNi42MjQgMjAuNzExOUMzNi41MTM3IDIxLjA4MDEgMzYuMzQ4NiAyMS4xNTk3IDM1Ljk2MjQgMjFDMzQuNjMwOSAyMC40MzIxIDMzLjQ4MSAxOS41OTE4IDMyLjQ2NDQgMTguNTc1N0MzMC43MzkzIDE2Ljg3MjEgMjkuMTc5MiAxNC45OTE3IDI3LjIzMzQgMTMuNTJDMjYuNzc2NCAxMy4xNzU4IDI2LjMxOTMgMTIuODU2IDI1Ljg0NjcgMTIuNTUxOEMyMy44NjE4IDEwLjU4NCAyNi4xMDY5IDguOTY3NzcgMjYuNjI3IDguNzc1ODhDMjcuMTcwNCA4LjU3NTY4IDI2LjgxNTkgNy44ODc3IDI1LjA1OTEgNy44OTZDMjMuMzAyMiA3LjkwMzgxIDIxLjY5NTMgOC41MDM5MSAxOS42NDcgOS4zMDM3MUMxOS4zNDc3IDkuNDIzODMgMTkuMDMyMiA5LjUxMTcyIDE4LjcwOTUgOS41ODM5OEMxNi44NTAxIDkuMjIzNjMgMTQuOTE5OSA5LjE0MzU1IDEyLjkwMzMgOS4zNzU5OEM5LjEwNTk2IDkuODA3NjIgNi4wNzI3NSAxMS42Mzk2IDMuODQzMjYgMTQuNzY4MUMxLjE2NDU1IDE4LjUyNzggMC41MzQxOCAyMi43OTk4IDEuMzA2NjQgMjcuMjU1OUMyLjExNzY4IDMxLjk1MjEgNC40NjU4MiAzNS44Mzk4IDguMDczNzMgMzguODc5OUMxMS44MTU5IDQyLjAzMjIgMTYuMTI1NSA0My41NzYyIDIxLjA0MSA0My4yODAzQzI0LjAyNjkgNDMuMTA0IDI3LjM1MTYgNDIuNjk2MyAzMS4xMDE2IDM5LjQ1NjFDMzIuMDQ2OSAzOS45MzYgMzMuMDM5NiA0MC4xMjc5IDM0LjY4NiA0MC4yNzJDMzUuOTU0NiA0MC4zOTIxIDM3LjE3NTggNDAuMjA4IDM4LjEyMTEgNDAuMDA3OEMzOS42MDIxIDM5LjY4OCAzOS40OTk1IDM4LjI4ODEgMzguOTYzOSAzOC4wMzIyQzM0LjYyMyAzNS45Njc4IDM1LjU3NjIgMzYuODA4MSAzNC43MSAzNi4xMjc5QzM2LjkxNTUgMzMuNDYzOSA0MC4yNDAyIDMwLjY5NTggNDEuNTQgMjEuNzI4QzQxLjY0MjYgMjEuMDE2MSA0MS41NTU3IDIwLjU2NzkgNDEuNTQgMTkuOTkxN0M0MS41MzIyIDE5LjYzOTYgNDEuNjEwOCAxOS41MDM5IDQyLjAwNDkgMTkuNDYzOUM0My4wOTIzIDE5LjMzNTkgNDQuMTQ3OSAxOS4wMzE3IDQ1LjExNjcgMTguNDg3OEM0Ny45MjkyIDE2LjkxOTkgNDkuMDY0IDE0LjM0MzggNDkuMzMxNSAxMS4yNTU5QzQ5LjM3MTEgMTAuNzgzNyA0OS4zMjM3IDEwLjI5NTkgNDguODM1NCAxMC4wNDc5Wk0yNC4zMjYyIDM3LjgzOThDMjAuMTE5NiAzNC40NjM5IDE4LjA3OTEgMzMuMzUyMSAxNy4yMzU4IDMzLjM5OTlDMTYuNDQ4MiAzMy40NDgyIDE2LjU4OTggMzQuMzY4MiAxNi43NjMyIDM0Ljk2NzhDMTYuOTQ0MyAzNS41NjAxIDE3LjE4MTIgMzUuOTY4MyAxNy41MTE3IDM2LjQ4NzhDMTcuNzQwMiAzNi44MzIgMTcuODk3OSAzNy4zNDQyIDE3LjI4MzIgMzcuNzI4QzE1LjkyODIgMzguNTg0IDEzLjU3MjggMzcuNDM5OSAxMy40NjI0IDM3LjM4MzhDMTAuNzIwNyAzNS43MzU4IDguNDI4MjIgMzMuNTYwMSA2LjgxMzQ4IDMwLjU4NEM1LjI1MzQyIDI3LjcxOTcgNC4zNDc2NiAyNC42NDc5IDQuMTk3NzUgMjEuMzY3N0M0LjE1ODIgMjAuNTc1NyA0LjM4NjcyIDIwLjI5NTkgNS4xNTg2OSAyMC4xNTE5QzYuMTc1MjkgMTkuOTYgNy4yMjMxNCAxOS45MTk5IDguMjM5MjYgMjAuMDcxOEMxMi41MzI3IDIwLjcxMTkgMTYuMTg4NSAyMi42NzE5IDE5LjI1MjkgMjUuNzc1OUMyMS4wMDIgMjcuNTQzOSAyMi4zMjUyIDI5LjY1NTggMjMuNjg4NSAzMS43MjAyQzI1LjEzNzcgMzMuOTEyMSAyNi42OTc4IDM2IDI4LjY4MzEgMzcuNzExOUMyOS4zODQzIDM4LjMxMiAyOS45NDM0IDM4Ljc2ODEgMzAuNDc5IDM5LjEwNEMyOC44NjQzIDM5LjI4ODEgMjYuMTY5OSAzOS4zMjgxIDI0LjMyNjIgMzcuODM5OFpNMjYuMzQzMyAyNC42MDAxQzI2LjM0MzMgMjQuMjQ4IDI2LjYxOTEgMjMuOTY3OCAyNi45NjU4IDIzLjk2NzhDMjcuMDQ0NCAyMy45Njc4IDI3LjExNTIgMjMuOTgzOSAyNy4xNzgyIDI0LjAwNzhDMjcuMjY1MSAyNC4wNCAyNy4zNDM4IDI0LjA4NzkgMjcuNDA2NyAyNC4xNjAyQzI3LjUxNzEgMjQuMjcyIDI3LjU4MDEgMjQuNDMyMSAyNy41ODAxIDI0LjYwMDFDMjcuNTgwMSAyNC45NTIxIDI3LjMwNDIgMjUuMjMxOSAyNi45NTc1IDI1LjIzMTlDMjYuNjEwOCAyNS4yMzE5IDI2LjM0MzMgMjQuOTUyMSAyNi4zNDMzIDI0LjYwMDFaTTMyLjYwNjQgMjcuODc5OUMzMi4yMDQ2IDI4LjA0NzkgMzEuODAyNyAyOC4xOTE5IDMxLjQxNjUgMjguMjA4QzMwLjgxNzkgMjguMjM5NyAzMC4xNjQxIDI3Ljk5MjIgMjkuODA5NiAyNy42ODhDMjkuMjU4MyAyNy4yMTU4IDI4Ljg2NDMgMjYuOTUyMSAyOC42OTg3IDI2LjEyNzlDMjguNjI3OSAyNS43NzU5IDI4LjY2NzUgMjUuMjMxOSAyOC43MzA1IDI0LjkxOTlDMjguODcyMSAyNC4yNDggMjguNzE0NCAyMy44MTU5IDI4LjI0OTUgMjMuNDIzOEMyNy44NzE2IDIzLjEwNCAyNy4zOTExIDIzLjAxNjEgMjYuODYzMyAyMy4wMTYxQzI2LjY2NiAyMy4wMTYxIDI2LjQ4NDkgMjIuOTI3NyAyNi4zNTExIDIyLjg1NkMyNi4xMzA0IDIyLjc0NDEgMjUuOTQ5MiAyMi40NjM5IDI2LjEyMjYgMjIuMTIwMUMyNi4xNzc3IDIyLjAwNzggMjYuNDQ1OCAyMS43MzU4IDI2LjUwODggMjEuNjg4QzI3LjIyNTYgMjEuMjcyIDI4LjA1MjcgMjEuNDA3NyAyOC44MTY5IDIxLjcxOTdDMjkuNTI1OSAyMi4wMTYxIDMwLjA2MTUgMjIuNTYwMSAzMC44MzQgMjMuMzI4MUMzMS42MjE2IDI0LjI1NTkgMzEuNzYzMiAyNC41MTE3IDMyLjIxMjQgMjUuMjA4QzMyLjU2NjkgMjUuNzUyIDMyLjg5MDEgMjYuMzEyIDMzLjExMDQgMjYuOTUyMUMzMy4yNDQ2IDI3LjM1MjEgMzMuMDcxMyAyNy42ODAyIDMyLjYwNjQgMjcuODc5OVoiLz4KPC9zdmc+Cg=='

interface DesktopBridge {
  version?: string
  platform?: string
  dshUrl?: string
  runtimeVersion?: string
}

// 预加载注入的只读桥接对象（contextBridge）
const desktop = (window as unknown as { __DSH_DESKTOP__?: DesktopBridge }).__DSH_DESKTOP__

/** 注入爪印 logo（白色爪印配深色启动页） */
function applyLogo(): void {
  const img = document.querySelector<HTMLImageElement>('#logo')
  if (img) {
    img.src = LOGO_DATA_URI
    img.classList.add('show')
  }
}

/** 展示启动/错误状态 */
function render(): void {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')

  const status = document.querySelector('#status')
  const detail = document.querySelector('#detail')
  const retry = document.querySelector('#retry')
  const spinner = document.querySelector('#spinner')

  if (error) {
    // 错误页
    if (status) status.textContent = '启动失败'
    if (detail) {
      detail.textContent = error
      detail.classList.add('error')
    }
    if (spinner) spinner.classList.add('hidden')
    if (retry) {
      retry.classList.remove('hidden')
      retry.addEventListener('click', () => window.location.reload())
    }
    document.title = 'DSH Studio — 启动失败'
  } else {
    // 启动页
    const url = desktop?.dshUrl
    if (status) {
      status.textContent = url ? `正在启动 dsh… (${url})` : '正在启动 dsh…'
    }
    if (detail) {
      detail.textContent = '若长时间停留在此页，请查看应用日志（用户数据目录 desktop.log）'
    }
    document.title = 'DSH Studio'
  }
}

/** 无边框窗口控制桥类型（与 preload 暴露的 __dshDesktop 对应） */
interface DshDesktopBridge {
  windowControl?: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    startDrag: () => void
    dragBy: (dx: number, dy: number) => void
    endDrag: () => void
  }
  onMaximizedChange?: (cb: (isMax: boolean) => void) => void
}

const dshDesktopApi = (window as unknown as { __dshDesktop?: DshDesktopBridge }).__dshDesktop
const platform = desktop?.platform ?? ''

/** 绑定窗口控制按钮（win/linux 右上角三键 + mac 左上角信号灯）+ 拖拽条双击最大化。 */
function setupWindowControls(): void {
  const api = dshDesktopApi?.windowControl
  const dragbar = document.querySelector<HTMLElement>('#dragbar')

  // mac：左上角信号灯（关闭/最小化/最大化）
  const tlClose = document.querySelector<HTMLButtonElement>('#tl-close')
  const tlMin = document.querySelector<HTMLButtonElement>('#tl-min')
  const tlMax = document.querySelector<HTMLButtonElement>('#tl-max')
  tlClose?.addEventListener('click', () => void api?.close())
  tlMin?.addEventListener('click', () => void api?.minimize())
  tlMax?.addEventListener('click', () => void api?.toggleMaximize())

  // win/linux：右上角三键
  const minBtn = document.querySelector<HTMLButtonElement>('#btn-min')
  const maxBtn = document.querySelector<HTMLButtonElement>('#btn-max')
  const closeBtn = document.querySelector<HTMLButtonElement>('#btn-close')
  minBtn?.addEventListener('click', () => void api?.minimize())
  maxBtn?.addEventListener('click', () => void api?.toggleMaximize())
  closeBtn?.addEventListener('click', () => void api?.close())
  dragbar?.addEventListener('dblclick', () => void api?.toggleMaximize())

  // 手动拖动（不用 -webkit-app-region: drag，避免吞掉 DOM 事件导致双击失效）
  let dragging = false
  dragbar?.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    dragging = true
    api?.startDrag()
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    api?.dragBy(e.movementX || 0, e.movementY || 0)
  })
  window.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    api?.endDrag()
  })

  // 最大化状态同步按钮图标（还原 ↔ 最大化）
  const reflectMax = (isMax: boolean): void => {
    if (maxBtn) {
      maxBtn.title = isMax ? '还原' : '最大化'
      maxBtn.setAttribute('aria-label', maxBtn.title)
      const svg = maxBtn.querySelector('svg')
      if (svg) {
        svg.innerHTML = isMax
          ? '<path d="M4 4V2h6v6H8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="2" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/>'
          : '<rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1" stroke="currentColor" stroke-width="1.2"/>'
      }
    }
    if (tlMax) tlMax.title = isMax ? '还原' : '最大化'
  }
  dshDesktopApi?.onMaximizedChange?.(reflectMax)
  void api?.isMaximized().then(reflectMax)
}

// 平台标记（CSS 据此切 win 右上角 / mac 信号灯）
document.body.setAttribute('data-dsh-platform', platform)

applyLogo()
render()
setupWindowControls()
