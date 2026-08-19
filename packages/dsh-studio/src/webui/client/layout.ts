/** 布局微调（纯 CSS 注入，不动官方源码）。
 *
 * - 去掉左栏与内容区之间分割线的颜色。
 * - 右侧顶部标题栏：官方 conversation header 背景改成左栏同色，横贯全窗
 *   （含右侧详情列上方；顶部用左栏同色填充，视觉贯通）。
 * - 右侧边栏：官方 details 列（挤占式，展开时把中间内容区往左挤），
 *   标题栏折叠按钮调用官方 ctx.layout 的 openDetails()/closeDetails()。
 */

import { SYNC_EVENT } from './stats-panel.ts'

const STYLE_ID = 'dsh-studio-webui-layout-tweaks'

const LAYOUT_CSS = `
:root {
  /* 标题栏左侧常驻区（logo+左折叠）总宽，供 titleRow 右移避让 */
  --dsh-studio-left-width: 246px;
  /* 左栏宽度（可拖拽调整） */
  --dsh-sidebar-w: 220px;
}

/* ── 全局：禁止非录入区的文本选取；鼠标默认箭头，不显示 I-beam ── */
:root {
  -webkit-user-select: none;
  user-select: none;
}
/* 最广覆盖：所有元素默认箭头。后续用 html 前缀提特异性豁免。 */
html,
body,
body * {
  cursor: default !important;
}
/* 可输入/可编辑/对话框（对话流）区：恢复选词能力 + text 光标 */
html input,
html textarea,
html [contenteditable="true"],
html [contenteditable=""],
html [role="textbox"] {
  -webkit-user-select: text;
  user-select: text;
  cursor: text !important;
}
html [data-chat-flow],
html [data-chat-anchor-key] {
  -webkit-user-select: text;
  user-select: text;
}
/* 对话流内可交互控件：pointer（文本本身仍是箭头，data-chat-flow 已豁免选词） */
html [data-chat-flow] button,
html [data-chat-flow] a,
html [data-chat-flow] select,
html [data-chat-flow] summary,
html [data-chat-flow] [role="button"],
html [data-chat-flow] [role="menuitem"],
html [data-chat-flow] [role="link"] {
  cursor: pointer !important;
}
/* 其余全局交互控件：pointer */
html button,
html a,
html select,
html summary,
html [role="button"],
html [role="menuitem"],
html [role="link"],
html [role="tab"],
html label {
  cursor: pointer !important;
}
/* 控件内部的可视子元素（图标 svg/span/i/img 等）也应继承手型：
   否则全局 cursor:default 会把按钮/链接内的图标层压回默认箭头。
   用 ::slotted 无法覆盖，这里按已知控件容器直接给其后代恢复 pointer。 */
html button svg,
html button img,
html button span,
html button i,
html a svg,
html a img,
html a span,
html label svg,
html [role="button"] svg,
html [role="button"] img,
html [role="menuitem"] svg,
html [role="tab"] svg,
html [role="link"] svg {
  cursor: pointer !important;
}
html [data-chat-flow] button svg,
html [data-chat-flow] button img,
html [data-chat-flow] button span,
html [data-chat-flow] button i,
html [data-chat-flow] a svg,
html [data-chat-flow] a img,
html [data-chat-flow] [role="button"] svg,
html [data-chat-flow] [role="menuitem"] svg,
html [data-chat-flow] [role="tab"] svg,
html [data-chat-flow] [role="link"] svg {
  cursor: pointer !important;
}
/* 按钮内部图标永远不是命中目标：鼠标事件直接落在按钮本体。
   视觉上图标区仍继承手型（上一段的 svg 规则），交互上不会“点不中”。 */
html button svg,
html button img,
html button i,
html a svg,
html a img,
html [role="button"] svg,
html [role="button"] img,
html [role="menuitem"] svg,
html [role="tab"] svg,
html [role="link"] svg {
  pointer-events: none !important;
}
/* 官方主发送/停止按钮（.primary）：保留官方 cursor 语义。
   非禁用=手型、禁用=default；不被全局 cursor:default 覆盖。 */
html .primary:not(:disabled),
html button.primary:not(:disabled) {
  cursor: pointer !important;
}
html .primary:disabled,
html button.primary:disabled {
  cursor: default !important;
}
/* 右栏拖拽柄 */
.dsh-studio-right-resizer {
  cursor: col-resize !important;
}

/* 左栏与内容区分割线：透明（无视觉分割线，宽度保留） */
.pI_x6G_sidebarCol {
  border-right-color: transparent !important;
}

/* 左栏 logo 行隐藏：logo 与折叠按钮已移到标题栏，左栏从新会话开始 */
.pI_x6G_sidebarCol .hHd-Xa_logoRow,
.pI_x6G_sidebarCol [class*="logoRow"] {
  display: none !important;
}
.pI_x6G_sidebarCol button {
  position: relative;
  z-index: 100;
}

/* 标题栏左侧：logo + 左折叠按钮 */
.dsh-studio-titlebar-logo {
  flex: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin-right: 18px;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
}
.dsh-studio-left-toggle {
  cursor: pointer;
  width: 28px;
  height: 28px;
  flex: none; /* 不被左容器 flex 压缩，保持正圆 */
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: none;
  border-radius: 50%;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 14px;
}
.dsh-studio-left-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

/* 左上角常驻 logo + 左折叠钮：独立 fixed 容器，
   不受官方 header 隐藏（新会话 blank 页 header display:none）影响，始终显示。
   --dsh-studio-left-width = 官方 wordmark(高24→宽182) + gap + 折叠钮 + padding */
.dsh-studio-titlebar-left {
  position: fixed;
  top: 0;
  left: 0;
  height: 60px;
  width: var(--dsh-studio-left-width);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px 0 12px;
  box-sizing: border-box;
  z-index: 201;
  background: transparent;
  pointer-events: none;
}
.dsh-studio-titlebar-left > * {
  pointer-events: auto;
}
/* 标题栏现在是系统原生 drag 区：只让 logo/折叠按钮本身 no-drag（可点击），
   容器其余空白仍是拖拽区 → 左侧整条标题栏都能拖/双击最大化。 */
.dsh-studio-titlebar-left .dsh-studio-titlebar-logo,
.dsh-studio-titlebar-left .dsh-studio-left-toggle,
.dsh-studio-titlebar-left button {
  -webkit-app-region: no-drag;
}
/* 标题栏中央的会话标题/面包屑：属于整条拖拽区，不显示手型、不可误触。
   （官方 .wSkVaW_crumb 是 button，全局 button 规则会把它变手型 → 归回 default） */
html .wSkVaW_header .wSkVaW_crumb,
html .wSkVaW_header .wSkVaW_crumbCurrent,
html .wSkVaW_header .wSkVaW_titleCluster,
html .wSkVaW_header [class*="crumb"] {
  cursor: default !important;
  pointer-events: none !important;
}
/* Windows/Linux：logo 稍往右，左侧留一点空，视觉更平衡（mac 由红绿灯 margin 处理）。 */
body:not([data-dsh-platform="darwin"]) .dsh-studio-titlebar-left {
  padding-left: 24px;
}
/* macOS：系统红绿灯（titleBarStyle:hidden + trafficLightPosition）在左上角占位。
   直接给 logo / 折叠按钮 margin-left 右移避开红绿灯（容器布局不动，最直接生效）。 */
body[data-dsh-platform="darwin"] .dsh-studio-titlebar-left {
  left: 0;
}
body[data-dsh-platform="darwin"] .dsh-studio-titlebar-left .dsh-studio-titlebar-logo {
  margin-left: 72px;
}
/* 官方大小：BrandWordmark 高24px（宽按 182:24 → 182px）；
   margin-right 由容器 gap 控制，去掉通用 18px 以免撑宽。 */
.dsh-studio-titlebar-left .dsh-studio-titlebar-logo {
  flex: none;
  max-width: 196px;
  overflow: hidden;
  margin-right: 0;
}
.dsh-studio-titlebar-left .dsh-studio-titlebar-logo svg {
  display: block;
  height: 24px;
  width: auto;
}
/* DSH Studio 字标：爪印徽标 + 文字，横向 flex，深/浅色跟随文字色 */
.dsh-studio-logo-mark {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.dsh-studio-logo-mark svg {
  flex: none;
  color: var(--dsw-alias-label-primary, currentColor);
}
.dsh-studio-logo-text {
  color: var(--dsw-alias-label-primary, currentColor);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
  line-height: 1;
}
/* 折叠态只留爪印（文字隐藏），展开恢复完整字标 */
.dsh-studio-titlebar-left.is-collapsed .dsh-studio-logo-text {
  display: none;
}
/* 折叠/展开均显示完整 DSH Studio 字标（爪印 + 文字） */

/* 标题栏 fixed 脱离文档流：根容器钉死视口高度、隐藏溢出，
   让普通浏览器（127.0.0.1:3443）与桌面一致——不再出现整页滚动条。 */
html, body {
  overflow: hidden !important;
  height: 100% !important;
  /* 顶部/四周底色与左栏一致：hero 页没有 .wSkVaW_header 时，
     顶部露出 body 背景，若不设会显示官方的 bg-base，和左栏不同色。
     这里统一用 sidebar-fill（含 dsh-studio 渐变主题的 frame-grad）。 */
  background: var(--dsh-studio-frame-grad, var(--dsw-specific-sidebar-fill)) !important;
}
#root, [data-slot="root"], .dsh-studio-app-root {
  height: 100% !important;
  overflow: hidden !important;
  background: transparent !important;
}
/* 顶部标题栏：fixed 贯穿整窗（跨左栏+内容区），高度对齐左栏 logo 行 60px */
/* 带左上/右上 12px 圆角：desktop 透明窗体依赖 #root 的 border-radius 做窗口圆角，
   而 fixed 标题栏贴 top:0 不会被 #root 的 overflow:hidden 裁剪，必须自己补圆角，
   否则会盖住窗口上方的两个圆角。最大化时取消（与 desktop 的
   body.dshkit-maximized #root 规则对齐）。 */
.wSkVaW_header {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  /* 与左右边栏同层级：标题栏 z-index 设 28（略低于左栏 30）。
     设置 overlay 挂在左栏 cast 内 z-index 30 > 28 → 设置窗口能盖住标题栏；
     对话区内部最高 100 也会正常盖过（但那是内容区正常层级）。 */
  z-index: 28 !important;
  height: 60px !important;
  padding: 0 20px !important;
  box-sizing: border-box;
  background: var(--dsh-studio-frame-grad, var(--dsw-specific-sidebar-fill)) !important;
  border-bottom-color: transparent !important;
  border-radius: 12px 12px 0 0 !important;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
body.dshkit-maximized .wSkVaW_header {
  border-radius: 0 !important;
}

/* 下方 frame 整体下移避开 fixed 标题栏；用 height+margin 而非 padding，
   避免 grid 高度超出视口把底部输入框挤出屏幕 */
.pI_x6G_frame {
  box-sizing: border-box;
  height: calc(100vh - 60px) !important;
  margin-top: 60px;
  /* 外圈底色：默认纯 sidebar-fill；渐变主题通过 token --dsh-studio-frame-grad 注入渐变 */
  background: var(--dsh-studio-frame-grad, var(--dsw-specific-sidebar-fill));
}
.wSkVaW_header .wSkVaW_titleRow {
  min-height: 0;
}
/* 标题行整体往右：按顺序 logo→折叠→(空)→标题→右侧，避免叠在一起 */
.wSkVaW_header .wSkVaW_titleRow {
  margin-left: calc(var(--dsh-studio-left-width, 246px) - 20px);
  min-width: 0;
}
/* ── 左栏折叠：与右栏对称——左栏 absolute + transform 滑出，内容区 margin 过渡 ── */
.pI_x6G_frame {
  grid-template-columns: minmax(0, 1fr) !important;
}
.pI_x6G_sidebarCol {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--dsh-studio-frame-grad, var(--dsw-specific-sidebar-fill));
  width: var(--dsh-sidebar-w, 220px);
  min-width: 150px;
  /* 用 left 过渡实现滑出（不用 transform，避免创建 containing block，
     否则官方设置 overlay(fixed,挂在左栏内)会被限制成 220px 左栏宽） */
  transition: left 0.28s var(--ds-ease-in-out, ease-in-out);
  z-index: 30;
  overflow: hidden;
}
/* 官方 sidebar root 有自己的 inline width，覆盖成跟随容器宽度，
   使内部内容随左栏动态重排（而非固定旧宽度被裁切） */
.pI_x6G_sidebarCol .hHd-Xa_root {
  width: 100% !important;
}
/* 左栏拖拽边缘：正对左栏/对话框交界线（左栏右缘 = 对话框左缘） */
.dsh-studio-left-resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 12px;
  cursor: col-resize !important;
  z-index: 40;
  touch-action: none;
}
/* 不显示指示线：保留 12px 可点面积 + col-resize 光标即可 */
body.dsh-studio-left-resizing .pI_x6G_sidebarCol,
body.dsh-studio-left-resizing .wSkVaW_root {
  transition: transform 0s, margin-left 0s !important;
}
body.dsh-studio-sidebar-collapsed .pI_x6G_sidebarCol {
  left: calc(-1 * var(--dsh-sidebar-w, 220px));
}
/* 折叠瞬间隐藏左栏内容（含官方 rail 窄条）：滑出过程不显示窄条，
   只有左栏背景整体向左滑出，内容区同步左移——去掉“先窄条再收起”的中间步骤 */
body.dsh-studio-sidebar-collapsed .pI_x6G_sidebarCol .hHd-Xa_root {
  opacity: 0 !important;
  transition: opacity 0s !important;
}
/* 内容区（root）展开时空出 220px，折叠占满；与右栏 margin 一致丝滑 */
.wSkVaW_root {
  margin-left: var(--dsh-sidebar-w, 220px);
  transition: margin-left 0.28s var(--ds-ease-in-out, ease-in-out);
}
body.dsh-studio-sidebar-collapsed .wSkVaW_root {
  margin-left: 6px;
}
/* 折叠后内容区顶到最左（左上角 logo 由 fixed 标题栏覆盖，不受左栏影响）；
   标题行仍排在 logo 右侧 */
body.dsh-studio-sidebar-collapsed .wSkVaW_header .wSkVaW_titleRow {
  margin-left: calc(var(--dsh-studio-left-width, 246px) - 20px);
}
.wSkVaW_header::after {
  display: none !important;
}

/* 禁用官方窗口层右侧 grid 列：右栏由我们放内容区内 */
.pI_x6G_detailsCol {
  display: none !important;
}

/* 取消顶部「对话/轨迹」标签切换器：整个中间区域都是对话 */
.wSkVaW_tabs {
  display: none !important;
}

/* 内容区定位上下文（右栏 absolute 用） + 背景与栏一体 + 底部留白 */
.wSkVaW_root {
  position: relative;
  background: var(--dsw-specific-sidebar-fill);
  /* 底部留出与边栏同色的 margin，让对话区不贴窗口底边 */
  padding-bottom: 6px;
}

/* 滑动过渡时长（收起时更明显，稍慢一点） */
.wSkVaW_root {
  --dsh-studio-right-slow: 0.28s;
  --dsh-studio-right-ease: var(--ds-ease-in-out, ease-in-out);
}

/* 对话区域（中间列：消息+输入框）：
   - 展开右侧栏时往左缩窄留出右栏空间，折叠时内容区扩展、但右侧仍留 6px
     与底部对称的边栏灰留白，不贴窗口右缘
   - 自身背景 bg-base（与边栏灰���分），在 sidebar-fill 外圈上形成
     白色圆角矩形；四圆角 + 细边框让形状清晰 */
.wSkVaW_scrollBody {
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 14px;
  overflow: hidden auto;
  margin-right: 6px;
  transition: margin-right var(--dsh-studio-right-slow) var(--dsh-studio-right-ease);
}
.wSkVaW_root.dsh-studio-right-open .wSkVaW_scrollBody {
  margin-right: var(--dsh-studio-right-width, 320px);
}
/* 启动/刷新恢复展开状态时：禁用过渡，避免对话区先占满再收回 */
.wSkVaW_root.dsh-studio-right-boot .wSkVaW_scrollBody {
  transition: none !important;
}
/* 拖拽右栏宽度时，边距平滑跟随（无过渡：跟手） */


/* 右侧栏宽度拖拽边缘（贴面板左缘，col-resize）
   与左栏一致：不显示指示线，保留 8px 可点面积 + col-resize 光标即可 */
.dsh-studio-right-resizer {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 5;
  touch-action: none;
}
/* 拖拽中：禁用面板滑入/滑出与滚动区 margin 过渡，宽度跟手 */
.dsh-studio-right-resizing .dsh-studio-right-panel {
  transition: transform 0s, visibility 0s;
}
.dsh-studio-right-resizing .wSkVaW_scrollBody {
  transition: margin-right 0s;
}

/* 右侧栏：内容区内、标题栏下方、右缘贴内容区；transform 滑入/滑出。
   visibility 用延迟过渡：展开立即可见，收起等 transform 滑出后再隐藏，
   这样收起的滑出动画不会被 visibility:hidden 立即吞掉。 */
.dsh-studio-right-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 6px;
  width: var(--dsh-studio-right-width, 320px);
  /* 与左栏/标题/外圈使用同一 frame-grad 底色 */
  background: var(--dsh-studio-frame-grad, var(--dsw-specific-sidebar-fill));
  border-left: 1px solid transparent;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  container-type: inline-size;
  container-name: right-panel;
  transform: translateX(102%);
  transition:
    transform var(--dsh-studio-right-slow) var(--dsh-studio-right-ease),
    visibility 0s linear var(--dsh-studio-right-slow);
  visibility: hidden;
  pointer-events: none;
}
.wSkVaW_root.dsh-studio-right-open .dsh-studio-right-panel {
  transform: translateX(0);
  visibility: visible;
  pointer-events: auto;
  transition:
    transform var(--dsh-studio-right-slow) var(--dsh-studio-right-ease),
    visibility 0s;
}
.dsh-studio-right-panel-header {
  flex: none;
  height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 10px 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
/* 单页（暂无分段控件）时 header 不占高：信息内容直接贴合面板顶部 */
.dsh-studio-right-panel-header:empty {
  display: none;
}
/* 页签组：胶囊式分段控件（与信息卡片同圆角、同毛玻璃感） */
.dsh-studio-right-tabs {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, var(--dsw-alias-bg-base));
  border-radius: 10px;
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--dsw-alias-bg-base) 42%, transparent);
}

/* 右侧栏页签：信息 / 会话 —— 胶囊分段控件，选中态 = hover 背景填充 */
.dsh-studio-right-tab {
  all: unset;
  flex: none;
  box-sizing: border-box;
  cursor: pointer;
  color: var(--dsw-alias-label-tertiary);
  padding: 5px 16px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  border-radius: 8px;
  text-align: center;
  white-space: nowrap;
  transition: color .18s ease, background-color .18s ease;
}
.dsh-studio-right-tab:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-studio-right-tab.is-active {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary) 26%, transparent);
}
.dsh-studio-right-tab:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}
.dsh-studio-right-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
}
.dsh-studio-right-tabpane {
  display: none;
}
.dsh-studio-right-tabpane.is-active {
  display: block;
}
/* ══════ 信息面板：响应式会话统计（容器查询自适应右侧栏宽度） ══════ */
.dsh-studio-info-stats {
  display: block;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 20px;
}
.dsh-studio-info-stats .dsh-studio-info-empty {
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 20px;
  padding: 8px 0;
}
.dsh-studio-stats-card {
  display: block !important;
  flex-direction: column !important;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: 14px;
  padding: 14px;
  box-shadow: var(--dsw-shadow-lv1, 0 1px 2px rgba(0, 0, 0, 0.04));
  animation: dsh-studio-stats-in .3s cubic-bezier(.22,.61,.36,1);
}
@keyframes dsh-studio-stats-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.dsh-studio-stats-head {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  margin-bottom: 12px;
}
.dsh-studio-stats-head-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}
.dsh-studio-stats-head-title {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-studio-stats-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 400;
  flex: none;
  white-space: nowrap;
}
.dsh-studio-stats-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
  animation: dsh-studio-stats-pulse 2s ease-in-out infinite;
}
.dsh-studio-stats-card { position: relative; }
@keyframes dsh-studio-stats-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}
.dsh-studio-stats-body {
  display: block !important;
  width: 100% !important;
}
.dsh-studio-stats-body > * + * {
  margin-top: 16px;
}
/* 窄容器收窄间距 */
@container right-panel (max-width: 319px) {
  .dsh-studio-stats-body > * + * { margin-top: 12px; }
}
.dsh-studio-stats-donut-wrap {
  position: relative;
  width: 132px;
  height: 132px;
  z-index: 0;
}
.dsh-studio-stats-donut {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  /* drop-shadow 辉光允许画出 SVG 边界，不被默认 overflow:hidden 截断 */
  overflow: visible;
}
.dsh-studio-stats-donut-track {
  stroke: var(--dsw-alias-interactive-bg-hover);
  stroke-width: 12;
}
.dsh-studio-stats-donut-arc {
  stroke: url(#dsh-studio-stats-donut-grad);
  stroke-width: 12;
  stroke-linecap: round;
  stroke-dasharray: var(--dsh-studio-donut-c, 264);
  stroke-dashoffset: 264;
  transition: stroke-dashoffset .8s cubic-bezier(.22,.61,.36,1);
  filter: drop-shadow(0 3px 8px color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent));
}
.dsh-studio-stats-card.dsh-studio-stats-live .dsh-studio-stats-donut-arc {
  stroke-dashoffset: var(--donut-target, 264);
}
.dsh-studio-stats-donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.dsh-studio-stats-donut-value {
  color: var(--dsw-alias-label-primary);
  font-size: 25px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.dsh-studio-stats-donut-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.dsh-studio-stats-donut-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.dsh-studio-stats-cache-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-studio-stats-cache-row-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.dsh-studio-stats-cache-pct {
  color: var(--dsw-alias-state-success-primary);
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.dsh-studio-stats-cache-sub {
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 16px;
}
.dsh-studio-stats-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, transparent), transparent 60%);
  border-radius: 12px;
  padding: 16px 14px 14px;
}
.dsh-studio-stats-hero .dsh-studio-stats-cache-row {
  align-items: center;
}
.dsh-studio-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.dsh-studio-stats-tile {
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  animation: dsh-studio-stats-tile-in .35s cubic-bezier(.22,.61,.36,1) both;
  animation-delay: calc(var(--i, 0) * 40ms);
}
@keyframes dsh-studio-stats-tile-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.dsh-studio-stats-tile-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-studio-stats-tile-value {
  color: var(--dsw-alias-label-primary);
  font-size: 17px;
  font-weight: 650;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: transform .18s ease;
}
.dsh-studio-stats-tile:hover {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
  transform: translateY(-1px);
}
.dsh-studio-stats-tile:hover .dsh-studio-stats-tile-value {
  transform: translateX(0);
}
.dsh-studio-flash {
  animation: dsh-studio-stats-flash .9s ease-out;
}
@keyframes dsh-studio-stats-flash {
  0% { color: var(--dsw-alias-state-business-primary); text-shadow: 0 0 8px color-mix(in srgb, var(--dsw-alias-state-business-primary) 60%, transparent); }
  60% { color: var(--dsw-alias-state-business-primary); }
  100% { color: inherit; }
}
.dsh-studio-accent-brand { color: var(--dsw-alias-state-business-primary); }
.dsh-studio-accent-good { color: var(--dsw-alias-state-success-primary); }
.dsh-studio-accent-warn { color: var(--dsw-alias-state-warn-primary); }
.dsh-studio-stats-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-studio-stats-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.dsh-studio-stats-section-title::before {
  content: "";
  width: 3px;
  height: 10px;
  border-radius: 2px;
  background: var(--dsw-alias-state-business-primary);
  opacity: .8;
  flex: none;
}
.dsh-studio-stats-pairbar {
  display: flex;
  gap: 3px;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--dsw-alias-interactive-bg-hover);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--dsw-alias-bg-base) 40%, transparent);
}
.dsh-studio-stats-pairbar-time [data-k$="-seg"]:nth-child(1) { background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-business-primary) 92%, #fff), var(--dsw-alias-state-business-primary)); }
.dsh-studio-stats-pairbar-time [data-k$="-seg"]:nth-child(2) { background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-warn-primary) 92%, #fff), var(--dsw-alias-state-warn-primary)); }
.dsh-studio-stats-pairbar-token [data-k$="-seg"]:nth-child(1) { background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-business-primary) 92%, #fff), var(--dsw-alias-state-business-primary)); }
.dsh-studio-stats-pairbar-token [data-k$="-seg"]:nth-child(2) { background: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-success-primary) 92%, #fff), var(--dsw-alias-state-success-primary)); }
.dsh-studio-stats-pairbar [data-k] {
  transition: width .5s cubic-bezier(.22,.61,.36,1);
  border-radius: 999px;
  min-width: 2px;
}
.dsh-studio-stats-pairlegend {
  display: flex;
  gap: 12px;
}
.dsh-studio-stats-pairitem {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dsh-studio-stats-pairitem-swatch {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  flex: none;
}
.dsh-studio-stats-pairitem-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.dsh-studio-stats-pairitem-value {
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-studio-stats-pairbar-time + .dsh-studio-stats-pairlegend .dsh-studio-stats-pairitem:nth-child(1) .dsh-studio-stats-pairitem-swatch { background: var(--dsw-alias-state-business-primary); }
.dsh-studio-stats-pairbar-time + .dsh-studio-stats-pairlegend .dsh-studio-stats-pairitem:nth-child(2) .dsh-studio-stats-pairitem-swatch { background: var(--dsw-alias-state-warn-primary); }
.dsh-studio-stats-pairbar-token + .dsh-studio-stats-pairlegend .dsh-studio-stats-pairitem:nth-child(1) .dsh-studio-stats-pairitem-swatch { background: var(--dsw-alias-state-business-primary); }
.dsh-studio-stats-pairbar-token + .dsh-studio-stats-pairlegend .dsh-studio-stats-pairitem:nth-child(2) .dsh-studio-stats-pairitem-swatch { background: var(--dsw-alias-state-success-primary); }

@container right-panel (max-width: 319px) {
  .dsh-studio-stats-card { padding: 12px; }
  .dsh-studio-stats-donut-wrap { width: 108px; height: 108px; }
  .dsh-studio-stats-donut-value { font-size: 20px; }
  .dsh-studio-stats-cache-pct { font-size: 18px; }
  .dsh-studio-stats-tile-value { font-size: 15px; }
  .dsh-studio-stats-tile { padding: 6px 8px; }
  .dsh-studio-stats-body { gap: 12px; }
}
@container right-panel (min-width: 420px) {
  .dsh-studio-stats-hero {
    flex-direction: row;
    justify-content: flex-start;
    gap: 18px;
  }
  .dsh-studio-stats-hero .dsh-studio-stats-cache-row {
    align-items: flex-start;
  }
  .dsh-studio-stats-cache-row-label { font-size: 12px; }
  .dsh-studio-stats-cache-pct { font-size: 24px; }
}
@container right-panel (min-width: 520px) {
  .dsh-studio-stats-grid { grid-template-columns: repeat(4, 1fr); }
  .dsh-studio-stats-card { padding: 16px; }
  .dsh-studio-stats-body { gap: 18px; }
}

/* ══════ 右侧栏「Git」页：只读仓库状态（与信息卡同风格） ══════ */
.dsh-studio-git-root {
  display: block;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 20px;
}
.dsh-studio-git-card {
  display: block;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: 14px;
  padding: 14px;
  box-shadow: var(--dsw-shadow-lv1, 0 1px 2px rgba(0, 0, 0, 0.04));
}
.dsh-studio-git-card > * + * {
  margin-top: 12px;
}
.dsh-studio-git-empty {
  color: var(--dsw-alias-label-caption);
  font-size: 12px;
  line-height: 20px;
  padding: 8px 0;
}
.dsh-studio-git-branch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  border-radius: 10px;
}
.dsh-studio-git-branch-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}
.dsh-studio-git-branch-name {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-studio-git-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.dsh-studio-git-section-title::before {
  content: "";
  width: 3px;
  height: 10px;
  border-radius: 2px;
  background: var(--dsw-alias-state-business-primary);
  opacity: .8;
  flex: none;
}
.dsh-studio-git-changes,
.dsh-studio-git-log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-studio-git-change,
.dsh-studio-git-logitem {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 3px 4px;
  border-radius: 6px;
  font-size: 12px;
}
.dsh-studio-git-change:hover,
.dsh-studio-git-logitem:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-studio-git-change-code {
  flex: none;
  min-width: 30px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 1px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
  color: var(--dsw-alias-state-business-primary);
}
.dsh-studio-git-change-file {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-secondary);
}
.dsh-studio-git-log-hash {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.dsh-studio-git-log-msg {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-primary);
}
/* ── 标题栏工具栏按钮：左折叠 / VS Code / 右折叠，统一圆角矩形 ──
 * 右侧两个放在同一 group（.dsh-studio-titlebar-actions，见 mountVscodeButton），
 * VS Code 在折叠按钮左侧。 */
.dsh-studio-titlebar-actions {
  flex: none;
  margin-left: auto; /* 将工具栏推到标题行最右端 */
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
body[data-dsh-platform="win32"] .dsh-studio-titlebar-actions,
body[data-dsh-platform="linux"] .dsh-studio-titlebar-actions {
  margin-right: 128px;
}
.dsh-studio-right-toggle,
.dsh-studio-left-toggle,
.dsh-studio-new-window {
  cursor: pointer;
  width: 30px;
  height: 28px;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color .15s ease;
}
.dsh-studio-right-toggle:hover,
.dsh-studio-right-toggle[aria-pressed="true"],
.dsh-studio-left-toggle:hover,
.dsh-studio-left-toggle[aria-pressed="true"],
.dsh-studio-new-window:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
/* win/linux：工具栏整体让位右上角窗口三键（与官方 Session log 同样 128px）；
   mac 无窗口控件，不需要。 */
body[data-dsh-platform="darwin"] .dsh-studio-titlebar-actions {
  margin-right: 0;
}
/* VS Code 按钮：由 vscode-button.tsx 用内联 style 画成圆形，这里覆盖为同款圆角矩形 */
.dsh-studio-titlebar-actions [data-dsh-studio-vscode="1"] {
  width: 30px !important;
  height: 28px !important;
  border: 1px solid transparent !important;
  border-radius: 8px !important;
  background: transparent;
}
.dsh-studio-titlebar-actions [data-dsh-studio-vscode="1"]:hover {
  background: var(--dsw-alias-interactive-bg-hover) !important;
}
/* 防闪烁：React 先在 headerActions（mode/分支之间）渲染，DOM 搬运到本工具栏前
   先隐藏原始槽位的按钮，搬进来后再显示 —— 避免「先出现在中间、再跳右边」。 */
.wSkVaW_headerActions [data-dsh-studio-vscode="1"] {
  display: none !important;
}
/* ── 底部（侧栏脚）设置/刷新一排：设置靠左、刷新靠右，
   两个都是圆角正方形、纯图标（不显示文字）。 ── */
html .hHd-Xa_root:not(.hHd-Xa_collapsed) button[aria-haspopup="dialog"][aria-expanded] {
  width: 34px !important;
  height: 34px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 10px !important;
  background: transparent !important;
  justify-content: center !important;
  align-items: center !important;
}
html .hHd-Xa_root:not(.hHd-Xa_collapsed) button[aria-haspopup="dialog"][aria-expanded]:hover {
  background: var(--dsw-alias-interactive-bg-hover) !important;
}
/* 隐藏设置按钮上的文字标签（只留齿轮图标） */
html .hHd-Xa_root:not(.hHd-Xa_collapsed) button[aria-haspopup="dialog"][aria-expanded] span {
  display: none !important;
}
.dsh-studio-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.dsh-studio-refresh:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
/* rail 折叠态：刷新钮隐藏，设置保持官方圆形 rail 图标 */
html .hHd-Xa_root.hHd-Xa_collapsed .dsh-studio-refresh {
  display: none !important;
}
`

/** 右侧面板图标 = 左侧 IconPanelLeftOutline16 的水平镜像（createElementNS 构建，可靠）。 */
const SVG_NS = 'http://www.w3.org/2000/svg'

/** 官方 FishLogo 三文鱼 SVG path（primitives FishLogo），内置不依赖官方 DOM。 */
const FISH_LOGO_PATH = 'M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z'

/** 内置 FishLogo（三文鱼品牌图），与官方 primitives 一致。 */
function buildFishLogo(elem: Document, size = 22): SVGSVGElement {
  const svg = elem.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size * 17.04 / 23.16))
  svg.setAttribute('viewBox', '0 0 23.16 17.04')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  const path = elem.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', FISH_LOGO_PATH)
  path.setAttribute('fill', 'currentColor')
  svg.appendChild(path)
  return svg
}

/**
 * DSH Studio 品牌字标：爪印徽标 + 「DSH Studio」文字。
 * 不依赖官方 DOM 的 BrandWordmark（那仍显示 DeepSeek Harness）；
 * icon 用爪印、旁边跟粗体字标，深/浅色用 currentColor 自适应。
 */
function buildStudioLogo(elem: Document, iconSize = 22): HTMLElement {
  const wrap = elem.createElement('span')
  wrap.className = 'dsh-studio-logo-mark'
  const icon = buildFishLogo(elem, iconSize)
  const text = elem.createElement('span')
  text.className = 'dsh-studio-logo-text'
  text.textContent = 'DSH Studio'
  wrap.appendChild(icon)
  wrap.appendChild(text)
  return wrap
}

function svgIcon(elem: Document, d: string): SVGSVGElement {
  const svg = elem.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  const g = elem.createElementNS(SVG_NS, 'g')
  g.setAttribute('transform', 'scale(-1,1) translate(-16,0)')
  const path = elem.createElementNS(SVG_NS, 'path')
  path.setAttribute('fill-rule', 'evenodd')
  path.setAttribute('clip-rule', 'evenodd')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'currentColor')
  g.appendChild(path)
  svg.appendChild(g)
  return svg
}

/** 不成像版的 svgIcon（刷新/设置等方向性图标用，避免被水平镜像翻转）。 */
function svgIconFlat(elem: Document, d: string, size = 16): SVGSVGElement {
  const svg = elem.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('fill', 'none')
  const path = elem.createElementNS(SVG_NS, 'path')
  path.setAttribute('fill-rule', 'evenodd')
  path.setAttribute('clip-rule', 'evenodd')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'currentColor')
  svg.appendChild(path)
  return svg
}

const LEFT_PANEL_PATH = 'M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z'

/** 首帧防闪烁已完成：我们的 DSH Studio 定制 UI 已挂载到 DOM。
 * 通知 host 注入的 no-flash 排版可以撤掉启动画面、恢复 #root 可见。
 * 幂等：多次调用无副作用。 */
export function revealStudioUi(): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-dsh-studio-ready', '1')
  document.getElementById('dsh-studio-splash')?.remove()
  const style = document.getElementById('dsh-studio-noflash')
  if (style) style.remove()
  const fb = document.getElementById('dsh-studio-noflash-fallback')
  if (fb) fb.remove()
}

/** 当真实 UI 与我们的定制 chrome 都就位后，撤销 no-flash 隐藏/启动画面。
 * 在官方 settled UI 挂载前调用会直接返回（避免先露出官方加载页再跳定制 UI）。 */
function maybeReveal(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('dsh-studio-splash') === null
      && document.documentElement.hasAttribute('data-dsh-studio-ready')) return
  // 真实 UI 已挂载的信号：侧栏 root 或官方 header 出现。
  // （hero 空白页没有 .wSkVaW_header，但两种页面都有 .hHd-Xa_root 侧栏。）
  if (document.querySelector('.hHd-Xa_root') === null
      && document.querySelector('.wSkVaW_header') === null) return
  revealStudioUi()
}

/** 安装布局微调样式。幂等。 */
export function installLayoutTweaks(layout?: { toggleSidebar: () => void }): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (root === null) return
  if (document.getElementById(STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = LAYOUT_CSS
    ;(document.head ?? root).append(style)
  }

  // 同步标题栏高度到 root（供 details 列顶部填充使用）。
  const syncTitlebar = () => {
    const header = document.querySelector('.wSkVaW_header')
    const h = header ? Math.round(header.getBoundingClientRect().height) : 0
    root.style.setProperty('--dsh-studio-titlebar-height', `${Math.max(0, h)}px`)
  }
  syncTitlebar()

  // 移除历史残留的全屏拖拽条（.dshkit-dragbar），避免挡住左栏顶部按钮。
  document.querySelectorAll('.dshkit-dragbar').forEach((el) => el.remove())
  if (typeof ResizeObserver !== 'undefined') {
    const tryObserve = () => {
      const header = document.querySelector('.wSkVaW_header')
      if (header === null) return false
      const ro = new ResizeObserver(syncTitlebar)
      ro.observe(header)
      syncTitlebar()
      return true
    }
    if (!tryObserve()) {
      const mo = new MutationObserver(() => { if (tryObserve()) mo.disconnect() })
      mo.observe(document.body, { childList: true, subtree: true })
    }
  }

  // 右侧栏宽度：读存储，写回 CSS 变量。
  const RIGHT_WIDTH_KEY = 'dsh-studio:right-panel-width'
  const RIGHT_WIDTH_MIN = 200
  const RIGHT_WIDTH_MAX = 520
  const readRightWidth = (): number => {
    try {
      const v = Number(localStorage.getItem(RIGHT_WIDTH_KEY))
      if (Number.isFinite(v) && v >= RIGHT_WIDTH_MIN && v <= RIGHT_WIDTH_MAX) return v
    } catch { /* ignore */ }
    return 320
  }
  const applyRightWidth = (px: number) => {
    const w = Math.round(Math.min(RIGHT_WIDTH_MAX, Math.max(RIGHT_WIDTH_MIN, px)))
    root.style.setProperty('--dsh-studio-right-width', `${w}px`)
    try { localStorage.setItem(RIGHT_WIDTH_KEY, String(w)) } catch { /* ignore */ }
  }

  // ── 左栏宽度：可拖拽调整，持久化 ──
  const LEFT_WIDTH_KEY = 'dsh-studio:sidebar-width'
  const LEFT_WIDTH_MIN = 150
  const LEFT_WIDTH_MAX = 400
  const readLeftWidth = (): number => {
    try {
      const v = Number(localStorage.getItem(LEFT_WIDTH_KEY))
      if (Number.isFinite(v) && v >= LEFT_WIDTH_MIN && v <= LEFT_WIDTH_MAX) return v
    } catch { /* ignore */ }
    return 220
  }
  const applyLeftWidth = (px: number) => {
    const w = Math.round(Math.min(LEFT_WIDTH_MAX, Math.max(LEFT_WIDTH_MIN, px)))
    root.style.setProperty('--dsh-sidebar-w', `${w}px`)
    try { localStorage.setItem(LEFT_WIDTH_KEY, String(w)) } catch { /* ignore */ }
  }

  /** 挂左栏拖拽边缘：贴左栏右缘，左右拖动改宽度（与右栏对称）。 */
  const mountLeftResizer = () => {
    const col = document.querySelector<HTMLElement>('.pI_x6G_sidebarCol')
    if (col === null) return
    if (col.querySelector('.dsh-studio-left-resizer') !== null) return
    const resizer = document.createElement('div')
    resizer.className = 'dsh-studio-left-resizer'
    resizer.setAttribute('aria-hidden', 'true')
    col.appendChild(resizer)

    let startX = 0
    let startW = 0
    let dragging = false
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      // 左栏贴左缘，向右拖 = 变宽：宽度 = 起始宽 + (当前X - 起始X)
      applyLeftWidth(startW + (e.clientX - startX))
      e.preventDefault()
    }
    const onUp = () => {
      if (!dragging) return
      dragging = false
      document.body.classList.remove('dsh-studio-left-resizing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    resizer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      dragging = true
      startX = e.clientX
      startW = readLeftWidth()
      document.body.classList.add('dsh-studio-left-resizing')
      resizer.setPointerCapture?.(e.pointerId)
      e.preventDefault()
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    })
  }

  // 右侧栏展开/收起状态：持久化，切换对话/刷新都不自动折叠。
  const OPEN_KEY = 'dsh-studio:right-panel-open'
  const readOpen = (): boolean => localStorage.getItem(OPEN_KEY) === '1'
  const saveOpen = (open: boolean) => {
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0') } catch { /* ignore */ }
  }

  // 挂拖拽边缘：按住面板左缘左右拖动调整宽度。
  const mountResizer = (panel: HTMLElement) => {
    if (panel.querySelector('.dsh-studio-right-resizer') !== null) return
    const resizer = document.createElement('div')
    resizer.className = 'dsh-studio-right-resizer'
    resizer.setAttribute('aria-hidden', 'true')
    panel.appendChild(resizer)

    let startX = 0
    let startW = 0
    let dragging = false

    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      // 面板贴右缘，向左拖 = 变宽：宽度 = 起始宽 + (起始X - 当前X)
      applyRightWidth(startW + (startX - e.clientX))
      e.preventDefault()
    }
    const rootEl = () => document.querySelector('.wSkVaW_root')
    const onUp = () => {
      if (!dragging) return
      dragging = false
      rootEl()?.classList.remove('dsh-studio-right-resizing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    resizer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      dragging = true
      startX = e.clientX
      startW = readRightWidth()
      rootEl()?.classList.add('dsh-studio-right-resizing')
      resizer.setPointerCapture?.(e.pointerId)
      e.preventDefault()
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    })
  }

  // 构建内容区内的右侧栏（懒创建，单例）。
  /** 是否新会话页（hero）：此时不显示右侧栏与折叠按钮。 */
  const isNewSession = () => !!document.querySelector('.wSkVaW_root[data-phase="hero"]')

  const ensurePanel = (): HTMLElement | null => {
    if (isNewSession()) return null
    let panel = document.querySelector('.dsh-studio-right-panel') as HTMLElement | null
    if (panel !== null) return panel
    const contentRoot = document.querySelector('.wSkVaW_root')
    if (contentRoot === null) return null
    panel = document.createElement('div')
    panel.className = 'dsh-studio-right-panel'
    const header = document.createElement('div')
    header.className = 'dsh-studio-right-panel-header'

    // 右侧栏页签：信息 + Git；后续加文件查看等功能时在此追加一项即可。
    const tabs: Array<{ id: string; label: string }> = [
      { id: 'info', label: '信息' },
      { id: 'git', label: 'Git' },
    ]
    const body = document.createElement('div')
    body.className = 'dsh-studio-right-panel-body'

    const panes = new Map<string, HTMLElement>()
    // 页签多于一页时才显示分段控件；单页直接铺内容，避免空的胶囊托盘。
    const tabList = tabs.length > 1 ? document.createElement('div') : null
    if (tabList !== null) {
      tabList.className = 'dsh-studio-right-tabs'
      tabList.setAttribute('role', 'tablist')
      header.appendChild(tabList)
    }
    for (const t of tabs) {
      const tabBtn = document.createElement('button')
      tabBtn.type = 'button'
      tabBtn.className = 'dsh-studio-right-tab'
      tabBtn.textContent = t.label
      tabBtn.dataset.tab = t.id
      tabBtn.setAttribute('role', 'tab')
      tabBtn.setAttribute('aria-selected', String(false))
      if (tabList !== null) {
        tabBtn.addEventListener('click', () => {
          tabList.querySelectorAll<HTMLElement>('.dsh-studio-right-tab').forEach((b) => {
            const on = b === tabBtn
            b.classList.toggle('is-active', on)
            b.setAttribute('aria-selected', String(on))
          })
          panes.forEach((pane, pid) => {
            pane.classList.toggle('is-active', pid === t.id)
            pane.setAttribute('aria-hidden', String(pid !== t.id))
          })
          if (t.id === 'git') ensureGitPane(panes.get('git') ?? null)
        })
        tabList.appendChild(tabBtn)
      }

      const pane = document.createElement('div')
      pane.className = 'dsh-studio-right-tabpane' + (tabs.length > 1 ? '' : ' is-active')
      pane.dataset.pane = t.id
      pane.setAttribute('role', 'tabpanel')
      body.appendChild(pane)
      panes.set(t.id, pane)
    }
    const infoTab = tabList?.querySelector<HTMLElement>('.dsh-studio-right-tab[data-tab="info"]')
    infoTab?.classList.add('is-active')
    infoTab?.setAttribute('aria-selected', 'true')
    const infoPane = panes.get('info')
    if (infoPane) infoPane.classList.add('is-active')

    panel.appendChild(header)
    panel.appendChild(body)
    // 首次创建面板：套用已保存的宽度，再挂拖拽边缘。
    applyRightWidth(readRightWidth())
    contentRoot.appendChild(panel)
    mountResizer(panel)
    ensureInfoStats(panes.get('info') ?? null)
    ensureGitPane(panes.get('git') ?? null)
    return panel
  }

  // 确保右侧栏「信息」页有 .dsh-studio-info-stats 容器（实时统计 React 组件写入点）。
  const ensureInfoStats = (pane: HTMLElement | null) => {
    if (!pane) return
    let holder = pane.querySelector<HTMLElement>('.dsh-studio-info-stats')
    if (!holder) {
      holder = document.createElement('div')
      holder.className = 'dsh-studio-info-stats'
      pane.appendChild(holder)
    }
    // 保证信息页永远不是空白：先放一个可见的“加载中…”占位，
    // 实时统计组件写入真实数据时会被替换掉。
    if (!holder.querySelector('.dsh-studio-info-empty') && !holder.querySelector('[data-dsh-studio-live="stats"]')) {
      const empty = document.createElement('div')
      empty.className = 'dsh-studio-info-empty'
      empty.textContent = '会话统计加载中…'
      holder.appendChild(empty)
    }
    // 面板（含容器）就绪后，通知实时统计组件把最新数据写进来。
    // 等一帧再派发：确保 StatsPanelEntry 已挂载并注册了监听。
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event(SYNC_EVENT))
    })
  }

  // 右侧栏「Git」页：只读 git 状态（分支 / 变更 / 最近提交）。
  const ensureGitPane = (pane: HTMLElement | null) => {
    if (!pane) return
    let holder = pane.querySelector<HTMLElement>('.dsh-studio-git-root')
    if (!holder) {
      holder = document.createElement('div')
      holder.className = 'dsh-studio-git-root'
      pane.appendChild(holder)
    }
    renderGitPane(holder)
  }

  interface GitPaneResult {
    inRepo: boolean
    root?: string
    branch?: string
    changes: string[]
    log: string[]
    error?: string
  }

  /** 消费 cwd（vscode-button 已写入 window），请求 host 路由渲染 git 状态。 */
  const renderGitPane = (holder: HTMLElement) => {
    const cwd = (window as unknown as { __dshKitVscodeCwd?: string }).__dshKitVscodeCwd
    const notice = (text: string, cls = 'dsh-studio-git-empty') => {
      const box = document.createElement('div')
      box.className = cls
      box.textContent = text
      holder.replaceChildren(box)
    }
    if (!cwd) {
      notice('暂无打开的工作目录')
      return
    }
    const loading = document.createElement('div')
    loading.className = 'dsh-studio-git-empty'
    loading.textContent = 'Git 状态加载中…'
    holder.replaceChildren(loading)

    fetch('/dsh-studio-webui/git', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('git route ' + r.status))))
      .then((data: GitPaneResult) => {
        if (!data.inRepo) {
          notice(data.error || '当前目录不在 git 仓库中')
          return
        }
        const card = document.createElement('div')
        card.className = 'dsh-studio-git-card'

        // 分支行
        const row = document.createElement('div')
        row.className = 'dsh-studio-git-branch'
        const dot = document.createElement('span')
        dot.className = 'dsh-studio-git-branch-dot'
        row.appendChild(dot)
        const name = document.createElement('span')
        name.className = 'dsh-studio-git-branch-name'
        name.textContent = data.branch ?? 'HEAD'
        row.appendChild(name)
        card.appendChild(row)

        // 变更列表（host 解析为 { code, file }；兼容旧版字符串行，防版本错配白屏）
        if (data.changes.length > 0) {
          card.appendChild(sectionTitle('变更 ' + data.changes.length))
          const list = document.createElement('ul')
          list.className = 'dsh-studio-git-changes'
          for (const ch of data.changes) {
            const li = document.createElement('li')
            li.className = 'dsh-studio-git-change'
            const code = typeof ch === 'string'
              ? (ch.slice(0, 2).trim() || '??')
              : (ch.code ?? '')
            const file = typeof ch === 'string'
              ? ch.slice(3).trim()
              : (ch.file ?? '')
            li.appendChild(mkEl('span', 'dsh-studio-git-change-code', code))
            li.appendChild(mkEl('span', 'dsh-studio-git-change-file', file))
            list.appendChild(li)
          }
          card.appendChild(list)
        } else {
          card.appendChild(mkEl('div', 'dsh-studio-git-empty', '工作区干净，无变更'))
        }

        // 最近提交
        if (data.log.length > 0) {
          card.appendChild(sectionTitle('最近提交'))
          const ul = document.createElement('ul')
          ul.className = 'dsh-studio-git-log'
          for (const l of data.log) {
            const li = document.createElement('li')
            li.className = 'dsh-studio-git-logitem'
            const m = /^([a-f0-9]{7,}) (.+)$/.exec(l)
            li.appendChild(mkEl('span', 'dsh-studio-git-log-hash', m ? m[1].slice(0, 7) : l.split(' ')[0] ?? l))
            if (m) li.appendChild(mkEl('span', 'dsh-studio-git-log-msg', m[2]))
            ul.appendChild(li)
          }
          card.appendChild(ul)
        }
        holder.replaceChildren(card)
      })
      .catch((err: unknown) => notice(err instanceof Error ? err.message : 'Git 获取失败'))
  }

  const sectionTitle = (text: string) => {
    const d = document.createElement('div')
    d.className = 'dsh-studio-git-section-title'
    d.textContent = text
    return d
  }

  /** 轻量元素助手（Git 面板用）。 */
  const mkEl = (tag: string, className?: string, text?: string) => {
    const n = document.createElement(tag)
    if (className) n.className = className
    if (text !== undefined) n.textContent = text
    return n
  }

  const toggleBtn = () => document.querySelector('.dsh-studio-right-toggle') as HTMLButtonElement | null

  const setOpen = (open: boolean) => {
    const panel = ensurePanel()
    if (panel === null) return
    const contentRoot = document.querySelector('.wSkVaW_root')
    const btn = toggleBtn()
    const apply = () => {
      if (contentRoot) contentRoot.classList.toggle('dsh-studio-right-open', open)
      if (btn) btn.setAttribute('aria-pressed', open ? 'true' : 'false')
    }
    const panelEl = panel as HTMLElement & { __dshkitInited?: boolean }
    if (open && !panelEl.__dshkitInited) {
      // 首次：先确保处于收起态（transform 有初始值），下一帧再展开 → 首次也有动画
      panelEl.__dshkitInited = true
      if (contentRoot) contentRoot.classList.remove('dsh-studio-right-open')
      requestAnimationFrame(() => requestAnimationFrame(apply))
    } else {
      apply()
    }
    saveOpen(open)
  }
  const toggle = () => {
    const contentRoot = document.querySelector('.wSkVaW_root')
    const open = contentRoot?.classList.contains('dsh-studio-right-open') ?? false
    setOpen(!open)
  }

  // 静默同步展开/收起到存储值（无动画、不写回存储、不触发 setOpen）。
  // 用于对抗 React 重渲染把 .dsh-studio-right-open class 覆盖掉的情况
  // （切换对话等）：用户最后意图以存储为准，class 丢了就补回来。
  // 防抖：observer 高频触发时合并到下一帧，避免反复改 class。
  let syncScheduled = false
  /** 本次会话是否已把存储状态完整应用到首个面板（用于首帧免过渡）。 */
  let bootApplied = false
  const ensureOpenState = () => {
    if (syncScheduled) return
    const contentRoot = document.querySelector('.wSkVaW_root')
    if (contentRoot === null) return
    syncScheduled = true
    const apply = () => {
      syncScheduled = false
      const wantOpen = readOpen()
      const isOpen = contentRoot.classList.contains('dsh-studio-right-open')
      if (wantOpen !== isOpen) {
        // 首次恢复（启动/刷新）：禁用过渡，直接切到目标宽度，
        // 避免对话区先占满再平滑收回的闪烁。
        if (!bootApplied) contentRoot.classList.add('dsh-studio-right-boot')
        contentRoot.classList.toggle('dsh-studio-right-open', wantOpen)
        const btn = toggleBtn()
        if (btn) btn.setAttribute('aria-pressed', wantOpen ? 'true' : 'false')
        if (wantOpen) ensurePanel()
      }
      if (!bootApplied) {
        bootApplied = true
        // 下一帧移除 boot 类，恢复后续正常过渡
        requestAnimationFrame(() => requestAnimationFrame(() => contentRoot.classList.remove('dsh-studio-right-boot')))
      }
    }
    // 同步应用：MutationObserver 在 DOM 变化后、浏览器绘制前的微任务里触发，
    // 此时给 root 加 class 能让首帧就是目标的展开/收起宽度，避免先占满再跳变。
    apply()
  }

  // 标题栏右侧工具栏（VS Code + 右折叠）。先建 group，再按「VS Code 在左、折叠在右」填。
  const getTitlebarActions = (): HTMLElement | null => {
    const header = document.querySelector('.wSkVaW_header')
    if (header === null) return null
    const titleRow = header.querySelector('.wSkVaW_titleRow')
    if (titleRow === null) return null
    let group = titleRow.querySelector<HTMLElement>('.dsh-studio-titlebar-actions')
    if (group === null) {
      group = document.createElement('div')
      group.className = 'dsh-studio-titlebar-actions'
      group.setAttribute('aria-hidden', 'true')
      titleRow.appendChild(group)
    }
    return group
  }

  // 标题栏右侧折叠按钮（放进 group 末位）。
  const mountToggle = () => {
    if (isNewSession()) return
    if (document.querySelector('.dsh-studio-right-toggle') !== null) return
    const group = getTitlebarActions()
    if (group === null) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dsh-studio-right-toggle'
    btn.setAttribute('aria-label', '折叠/展开右侧边栏')
    btn.title = '右侧边栏'
    btn.appendChild(svgIcon(document, LEFT_PANEL_PATH))
    btn.addEventListener('click', toggle)
    group.appendChild(btn)
    syncTitlebar()
  }
  mountToggle()

  // 在右侧工具栏里「原生创建」VS Code 按钮（不依赖 React 先在 headerActions 渲染，
  // 因此不会先出现在 mode/分支之间造成闪烁）。
  // cwd 由 VscodeOpenButton（React 侧）写到 window.__dshKitVscodeCwd；这里点击时读取。
  const VSCODE_LOGO: string = 'data:image/png;base64,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'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'dsh-studio-vscode-open'
  btn.setAttribute('aria-label', '用 VS Code 打开当前项目')
  btn.setAttribute('data-dsh-studio-vscode', '1')
  const img = document.createElement('img')
  img.src = VSCODE_LOGO
  img.width = 18
  img.height = 18
  img.alt = ''
  img.draggable = false
  img.style.cssText = 'display:block;pointer-events:none'
  btn.appendChild(img)
  btn.addEventListener('click', () => {
    const cwd = (window as unknown as { __dshKitVscodeCwd?: string }).__dshKitVscodeCwd
    const api = (window as unknown as { __dshDesktop?: { openInVscode?: (path: string) => Promise<unknown> } }).__dshDesktop
    if (cwd && api?.openInVscode) void api.openInVscode(cwd)
  })
  const mountVscodeButton = (): void => {
    // 仅在桌面端显示：只有 Electron preload 暴露了 __dshDesktop.openInVscode
    // 才挂载按钮；纯 web 浏览器没有这个桥，标题栏不出现 VS Code 按钮。
    const desktopApi = (window as unknown as { __dshDesktop?: { openInVscode?: (path: string) => Promise<unknown> } }).__dshDesktop
    if (typeof desktopApi?.openInVscode !== 'function') return
    const group = getTitlebarActions()
    if (group === null) return
    if (group.querySelector('[data-dsh-studio-vscode="1"]') !== null) return
    const toggle = group.querySelector('.dsh-studio-right-toggle')
    group.insertBefore(btn, toggle)
  }
  mountVscodeButton()

  // 「新窗口」按钮：多开入口（mac 也放 VS Code 右侧，与右侧栏折叠钮并列）。
  // 点击 → 主进程 openNewWindow()（共享同一 dsh 后台，新开独立窗口）。
  const PLUS_PATH = 'M14 7H9V2C9 1.44772 8.55228 1 8 1C7.44772 1 7 1.44772 7 2V7H2C1.44772 7 1 7.44772 1 8C1 8.55228 1.44772 9 2 9H7V14C7 14.5523 7.44772 15 8 15C8.55228 15 9 14.5523 9 14V9H14C14.5523 9 15 8.55228 15 8C15 7.44772 14.5523 7 14 7Z'
  const mountNewWindowButton = (): void => {
    if (isNewSession()) return
    if (document.querySelector('.dsh-studio-new-window') !== null) return
    const group = getTitlebarActions()
    if (group === null) return
    const btnNew = document.createElement('button')
    btnNew.type = 'button'
    btnNew.className = 'dsh-studio-new-window'
    btnNew.setAttribute('aria-label', '新开一个窗口')
    btnNew.title = '新窗口 (Ctrl/Cmd+N)'
    btnNew.appendChild(svgIcon(document, PLUS_PATH))
    btnNew.addEventListener('click', () => {
      const api = (window as unknown as { __dshDesktop?: { windowControl?: { newWindow?: () => Promise<unknown> } } }).__dshDesktop
      void api?.windowControl?.newWindow?.()
    })
    const toggle = group.querySelector('.dsh-studio-right-toggle')
    const vscode = group.querySelector('[data-dsh-studio-vscode="1"]')
    // mac 要求放 VS Code 右边 → 即 vscode 之后、toggle 之前
    if (vscode && toggle) group.insertBefore(btnNew, toggle)
    else if (toggle) group.insertBefore(btnNew, toggle)
    else group.appendChild(btnNew)
    syncTitlebar()
  }
  // 桌面环境（有 __dshDesktop 桥）才挂按钮；纯浏览器不显示。
  const apiExists = !!(window as unknown as { __dshDesktop?: unknown }).__dshDesktop
  if (apiExists) mountNewWindowButton()

  // 「刷新」按钮：侧栏底部、设置按钮右侧的重载按钮（等同 Ctrl+R，重新拉 client bundle）。
  // 24x24 Material refresh（官方标准顺时针箭头，viewBox 24，非镜像）。
  const REFRESH_PATH_FILL = 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'
  const findSettingsTrigger = (): HTMLElement | null =>
    document.querySelector('.hHd-Xa_root button[aria-haspopup="dialog"][aria-expanded]') as HTMLElement | null
  const mountFooterExtras = (): void => {
    const trig = findSettingsTrigger()
    if (trig === null) return
    const parent = trig.parentElement
    if (parent === null) return
    // 设置靠左、刷新靠右，两个钮排在同一行（从左到右）。
    parent.style.display = 'flex'
    parent.style.alignItems = 'center'
    parent.style.gap = '4px'
    if (parent.querySelector('.dsh-studio-refresh') !== null) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dsh-studio-refresh'
    btn.setAttribute('aria-label', '刷新页面')
    btn.title = '刷新页面'
    btn.appendChild(svgIconFlat(document, REFRESH_PATH_FILL, 24))
    btn.addEventListener('click', () => location.reload())
    trig.after(btn)
  }
  mountFooterExtras()

  // 标题栏左侧 logo + 左折叠按钮（自己创建，控制 layout.toggleSidebar）。
  // 不再迁移官方 DOM，避免折叠态 React 重渲染导致图标丢失/无法展开。
  /** 左侧栏是否折叠：官方折叠态 sidebar root 带 .hHd-Xa_collapsed。 */
  const isSidebarCollapsed = () => !!document.querySelector('.hHd-Xa_root.hHd-Xa_collapsed')

  const mountLeftToggle = () => {
    if (typeof layout === 'undefined') return
    // 常驻左上角容器（logo + 左折叠钮）：
    // 独立 fixed，不受官方 header 隐藏（新会话 blank 页 header display:none）影响。
    let bar = document.querySelector('.dsh-studio-titlebar-left') as HTMLElement | null
    if (bar === null) {
      bar = document.createElement('div')
      bar.className = 'dsh-studio-titlebar-left'
      document.body.appendChild(bar)
    }

    // logo（最左）：DSH Studio 品牌字标 = 爪印徽标 + 「DSH Studio」文字。
    // 不再克隆官方 BrandWordmark（那仍显示 DeepSeek Harness），始终用我们自己的。
    let logo = bar.querySelector<HTMLElement>('.dsh-studio-titlebar-logo')
    if (logo === null) {
      logo = document.createElement('button')
      logo.type = 'button'
      logo.className = 'dsh-studio-titlebar-logo'
      logo.title = '新建会话'
      logo.addEventListener('click', () => layout.toggleSidebar())
      bar.appendChild(logo)
    }

    const collapsed = isSidebarCollapsed()
    bar.classList.toggle('is-collapsed', collapsed)
    // 全局标记：供标题行右移量与左栏隐藏使用
    document.body.classList.toggle('dsh-studio-sidebar-collapsed', collapsed)

    // 一律显示完整 DSH Studio 字标（爪印 + 文字），折叠/展开均保持。
    if (logo.querySelector('.dsh-studio-logo-mark') === null) {
      while (logo.firstChild) logo.removeChild(logo.firstChild)
      logo.appendChild(buildStudioLogo(document, 24))
    }

    // 折叠按钮（logo 右侧）。
    if (bar.querySelector('.dsh-studio-left-toggle') === null) {
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'dsh-studio-left-toggle'
      toggle.setAttribute('aria-label', '折叠/展开左侧边栏')
      toggle.title = '左侧边栏'
      toggle.appendChild(svgIcon(document, LEFT_PANEL_PATH))
      toggle.addEventListener('click', () => layout.toggleSidebar())
      bar.appendChild(toggle)
    }
  }
  mountLeftToggle()
  applyLeftWidth(readLeftWidth())
  mountLeftResizer()

  if (typeof MutationObserver === 'undefined') return
  const mo = new MutationObserver(() => {
    // 新会话页：隐藏右侧栏（若残留）且不挂折叠按钮
    if (isNewSession()) {
      const cr = document.querySelector('.wSkVaW_root')
      if (cr && cr.classList.contains('dsh-studio-right-open')) cr.classList.remove('dsh-studio-right-open')
      const rightToggle = document.querySelector('.dsh-studio-right-toggle')
      rightToggle?.remove()
      return
    }
    mountToggle()
    mountLeftToggle()
    mountLeftResizer()
    mountFooterExtras()
    ensureOpenState()
    maybeReveal()
  })
  // 同时监听 class（折叠态/右栏开合）与 data-phase（新会话↔对话切换）
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-phase'] })

  // 立即尝试恢复一次：若 root 已在 DOM（插件晚于 React 挂载），
  // 同步应用存储状态，避免首帧先按默认折叠占满、再跳回展开。
  ensureOpenState()

  // 兜底：切换左侧会话后，无论 React 如何重渲染/重挂载 root，
  // 定期复核展开状态与存储一致（用户最后意图优先）。
  window.setInterval(() => {
    mountLeftToggle()
    mountLeftResizer()
    mountVscodeButton()
    if (apiExists) mountNewWindowButton()
    mountFooterExtras()
    ensureOpenState()
    maybeReveal()
  }, 600)

  // 首帧防闪烁：挂载逻辑已就位，撤销 host 注入的隐藏/启动画面（等真实 UI 就绪后）。
  maybeReveal()
}
