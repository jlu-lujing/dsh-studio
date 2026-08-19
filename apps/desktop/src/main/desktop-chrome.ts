/**
 * 无边框窗口 chrome：向 dsh web UI 页面注入的 CSS 与 JS。
 *
 * 窗口框架策略（配合主进程 createWindow）：
 *  - 不透明窗口 + CSS 圆角（#root border-radius + overflow:hidden）
 *  - 标题栏用系统原生 -webkit-app-region: drag → Windows Aero Snap、macOS
 *    全屏/分屏/双击最大化全部回归，不再手算拖动。
 *  - macOS：titleBarStyle:hidden + trafficLightPosition 提供系统红绿灯，
 *    不再自绘信号灯。
 *  - Windows/Linux：自绘右上角 最小化/最大化/关闭 按钮。
 *
 * 平台判定：window.__DSH_DESKTOP__.platform（preload 注入，darwin/win32/linux）。
 * 注入代码是给「浏览器页面」执行的，window.__dshDesktop 由 preload 暴露。
 */

export const DESKTOP_CHROME_CSS = [
  // 不透明窗口 + CSS 圆角：内容铺满（#root overflow:hidden 裁出圆角）。
  '#root, [data-slot="root"], .dsh-studio-app-root { border-radius: 12px; overflow: hidden; }',
  'html, body { background: transparent !important; }',

  /* --- 窗口拖拽区：隐藏系统标题栏后，标题栏交给系统原生拖动（Snap/边缘贴靠回归） --- */
  /* macOS：系统红绿灯由 titleBarStyle:hidden + trafficLightPosition 提供，让出左侧空间 */
  'body[data-dsh-platform="darwin"] .wSkVaW_header {',
  '  -webkit-app-region: drag;',
  '  padding-left: 84px !important;',
  '}',
  /* no-drag 只给真正可点的元素：标题栏右侧动作群 + 左侧 logo/折叠 + 官方可编辑控件。
     标题栏中央的会话标题/面包屑保持 drag（跟随整条标题栏拖动，不显示手型）。 */
  'body[data-dsh-platform="darwin"] .dsh-studio-titlebar-actions,',
  'body[data-dsh-platform="darwin"] .dsh-studio-titlebar-left,',
  'body[data-dsh-platform="darwin"] [data-dsh-studio-vscode="1"],',
  'body[data-dsh-platform="darwin"] .dsh-studio-right-toggle,',
  'body[data-dsh-platform="darwin"] .dsh-studio-new-window,',
  'body[data-dsh-platform="darwin"] input,',
  'body[data-dsh-platform="darwin"] textarea,',
  'body[data-dsh-platform="darwin"] select {',
  '  -webkit-app-region: no-drag;',
  '}',
  /* 非 mac：标题栏整条可拖（系统原生拖动 → 保留 Aero Snap）；中央标题/面包屑也跟拖 */
  'body:not([data-dsh-platform="darwin"]) .wSkVaW_header {',
  '  -webkit-app-region: drag;',
  '}',
  'body:not([data-dsh-platform="darwin"]) .dsh-studio-titlebar-actions,',
  'body:not([data-dsh-platform="darwin"]) .dsh-studio-titlebar-left,',
  'body:not([data-dsh-platform="darwin"]) [data-dsh-studio-vscode="1"],',
  'body:not([data-dsh-platform="darwin"]) .dsh-studio-right-toggle,',
  'body:not([data-dsh-platform="darwin"]) .dsh-studio-new-window,',
  'body:not([data-dsh-platform="darwin"]) input,',
  'body:not([data-dsh-platform="darwin"]) textarea,',
  'body:not([data-dsh-platform="darwin"]) select {',
  '  -webkit-app-region: no-drag;',
  '}',

  /* mac：不显示自绘右上角控制按钮（系统红绿灯接管） */
  'body[data-dsh-platform="darwin"] .dshkit-winctl { display: none; }',

  /* ---- Windows/Linux：右上角控制按钮 ---- */
  '.dshkit-winctl {',
  '  position: fixed;',
  '  top: 0; right: 0;',
  '  height: 30px;',
  '  display: flex;',
  '  align-items: stretch;',
  '  gap: 2px;',
  '  padding-right: 0;',
  '  -webkit-app-region: no-drag;',
  '  z-index: 2147483647;',
  '  user-select: none;',
  '}',
  '.dshkit-winctl button {',
  '  width: 42px;',
  '  height: 30px;',
  '  border: none;',
  '  background: transparent;',
  '  color: var(--dsw-alias-label-primary, #e8ecf4);',
  '  border-radius: 0;',
  '  font-size: 14px;',
  '  line-height: 1;',
  '  display: inline-flex;',
  '  align-items: center;',
  '  justify-content: center;',
  '  cursor: default;',
  '  transition: background-color .12s ease;',
  '}',
  /* 与窗口轮廓一致：关闭按钮右上角跟随卡片 12px 圆角，其余直角 */
  '.dshkit-winctl button.dshkit-close { border-radius: 0 12px 0 0; }',
  '.dshkit-winctl button:hover { background: rgba(127,127,127,.18); }',
  '.dshkit-winctl button.dshkit-close:hover { background: rgba(232,17,35,.85); color: #fff; }',

  /* Session log 按钮往左移：给右上角控制按钮让位（仅非 mac 需要） */
  'body:not([data-dsh-platform="darwin"]) [class*="headerUtilities"] {',
  '  margin-right: 128px;',
  '}',

  /* 最大化时取消圆角（贴满屏幕，避免露边） */
  'body.dshkit-maximized #root,',
  'body.dshkit-maximized [data-slot="root"] {',
  '  border-radius: 0 !important;',
  '}',
  'body.dshkit-maximized .dshkit-winctl { top: 0; right: 0; }',
  'body.dshkit-maximized .dshkit-winctl button.dshkit-close { border-radius: 0; }',
].join('\n')

/** 注入到页面执行的脚本（平台标记 + 最大化同步 + 非 mac 控制按钮）。
 *  窗口拖动/双击/缩放均由系统 titlebar 机制处理（见 CSS -webkit-app-region），
 *  这里不再自绘拖动逻辑；macOS 用系统红绿灯，也不自绘信号灯。 */
export const DESKTOP_CHROME_JS = [
  '(function () {',
  '  if (window.__dshKitDesktopChrome__) return',
  '  window.__dshKitDesktopChrome__ = true',
  '',
  '  var style = document.createElement("style")',
  '  style.setAttribute("data-dsh-studio", "desktop-chrome")',
  '  style.textContent = window.__DSH_DESKTOP_CHROME_CSS__ || ""',
  '  document.head.appendChild(style)',
  '',
  '  /* 平台标记（darwin / win32 / linux） */',
  '  var platform = (window.__DSH_DESKTOP__ && window.__DSH_DESKTOP__.platform) || ""',
  '  document.body.setAttribute("data-dsh-platform", platform)',
  '  var isMac = platform === "darwin"',
  '',
  '  var SVG_NS = "http://www.w3.org/2000/svg"',
  '  function makeSvg(inner) {',
  '    var s = document.createElementNS(SVG_NS, "svg")',
  '    s.setAttribute("width", "12")',
  '    s.setAttribute("height", "12")',
  '    s.setAttribute("viewBox", "0 0 12 12")',
  '    s.setAttribute("fill", "none")',
  '    s.innerHTML = inner',
  '    return s',
  '  }',
  '',
  '  /* 最大化状态同步通用函数（非 mac 控制按钮用） */',
  '  function reflectMax(isMax, maxBtn, maxSvg, restoreSvg) {',
  '    var first = maxBtn.firstChild',
  '    if (first && maxSvg) maxBtn.replaceChild(makeSvg(isMax ? restoreSvg : maxSvg), first)',
  '    maxBtn.title = isMax ? "还原" : "最大化"',
  '    maxBtn.setAttribute("aria-label", maxBtn.title)',
  '    document.body.classList.toggle("dshkit-maximized", isMax)',
  '  }',
  '',
  '  if (!isMac) {',
  '    /* Windows/Linux：右上角控制按钮 */',
  '    var wrap = document.createElement("div")',
  '    wrap.className = "dshkit-winctl"',
  '    function mk(svgInner, title, cls) {',
  '      var b = document.createElement("button")',
  '      b.type = "button"',
  '      b.title = title',
  '      b.className = "dshkit-" + cls',
  '      b.setAttribute("aria-label", title)',
  '      b.appendChild(makeSvg(svgInner))',
  '      wrap.appendChild(b)',
  '      return b',
  '    }',
  '    var minBtn = mk("<path d=\\"M2 6h8\\" stroke=\\"currentColor\\" stroke-width=\\"1.2\\" stroke-linecap=\\"round\\"/>", "最小化", "min")',
  '    var maxSvg = "<rect x=\\"2.2\\" y=\\"2.2\\" width=\\"7.6\\" height=\\"7.6\\" rx=\\"1\\" stroke=\\"currentColor\\" stroke-width=\\"1.2\\"/>"',
  '    var restoreSvg = "<path d=\\"M4 4V2h6v6H8\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"1.2\\" stroke-linejoin=\\"round\\"/><rect x=\\"2\\" y=\\"4\\" width=\\"6\\" height=\\"6\\" rx=\\"1\\" stroke=\\"currentColor\\" stroke-width=\\"1.2\\"/>"',
  '    var maxBtn = mk(maxSvg, "最大化", "max")',
  '    var closeBtn = mk("<path d=\\"M3 3l6 6M9 3L3 9\\" stroke=\\"currentColor\\" stroke-width=\\"1.2\\" stroke-linecap=\\"round\\"/>", "关闭", "close")',
  '    minBtn.addEventListener("click", function () {',
  '      if (window.__dshDesktop && window.__dshDesktop.windowControl) window.__dshDesktop.windowControl.minimize()',
  '    })',
  '    maxBtn.addEventListener("click", function () {',
  '      if (window.__dshDesktop && window.__dshDesktop.windowControl) window.__dshDesktop.windowControl.toggleMaximize()',
  '    })',
  '    closeBtn.addEventListener("click", function () {',
  '      if (window.__dshDesktop && window.__dshDesktop.windowControl) window.__dshDesktop.windowControl.close()',
  '    })',
  '    if (window.__waitDshDesktop) {',
  '      window.__waitDshDesktop(function (api) {',
  '        if (api.windowControl && api.windowControl.isMaximized) api.windowControl.isMaximized().then(function (v) { reflectMax(v, maxBtn, maxSvg, restoreSvg) })',
  '        if (api.onMaximizedChange) api.onMaximizedChange(function (v) { reflectMax(v, maxBtn, maxSvg, restoreSvg) })',
  '      })',
  '    }',
  '    document.body.appendChild(wrap)',
  '  }',
  '})()',
].join('\n')

