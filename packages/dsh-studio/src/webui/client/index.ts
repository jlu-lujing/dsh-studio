/**
 * dsh-studio-webui, client half —— 主题商店入口。
 *
 * 组件职责：
 *  1. 从 client Cordis ctx 取官方 `theme` 服务（ui-theme 提供的 ThemeRuntime）；
 *  2. 用自己的 slot id 在官方设置页注册 `settings.section`「主题商店」面板。
 *
 * 与官方零冲突：slot id 是专属 dsh-studio-webui-themes，不顶替官方单元。
 */
import { createElement } from 'react'
import type { ThemeService } from './themes.ts'
import { ThemeStoreController } from './controller.ts'
import { ThemeStorePanel } from './panel.ts'
import { installLayoutTweaks } from './layout.ts'
import { StatsPanelEntry, SYNC_EVENT } from './stats-panel.ts'
import { VscodeOpenButton } from './vscode-button.tsx'

export const name = 'dsh-studio-webui'

/** ui-theme 提供 theme 服务；connection 供后续本机/远程差异化。 */
export const inject = ['theme', 'connection']

/*────────────────────────────── 装配 ───────────────────────────────*/
export function apply(ctx: { get(name: string): unknown; theme?: ThemeService }): void {
  const slots = ctx.get('slots') as {
    inject(name: string, fn: () => unknown): unknown
    register(...a: unknown[]): unknown
  } | undefined
  if (slots === undefined) return

  // 主题服务：优先官方标准注入的 ctx.theme（与官方 apply/getTheme 一致）；
  // 兜底用 ctx.get('theme')。
  const theme = (ctx.theme ?? ctx.get('theme')) as ThemeService | undefined
  // 控制器在插件 apply 作用域存活，不随设置页开合而注销主题/全局层。
  const controller = new ThemeStoreController(theme)
  void controller.init()

  // 布局微调：去掉分割线颜色 + 右侧标题栏 + 右侧边栏折叠/展开按钮。
  installLayoutTweaks(ctx.get('layout') as { toggleSidebar: () => void } | undefined)

  // 隐藏官方「外观」主题行（settings.general.item / appearance）：用更低
  // priority(-1) 注册同 id 空组件 shadow 掉它，让主题入口统一到本店主题商店
  // （我们已接管官方 system/light/dark + 预设；官方 boot-theme 首帧仍按
  // 官方 preference 设底色，防闪烁，最终由我们的 controller 保持一致）。
  slots.inject('settings.general.item', () =>
    slots.register(
      { name: 'settings.general.item', id: 'appearance', priority: -1 },
      () => null,
    ),
  )

  // 右侧栏「信息」页：实时会话统计。注册进官方 composer.dock 槽位，
  // 用更低 priority (-1) shadow 掉官方 StatsLine（同 id 'stats'）：
  //   - 原对话框下方不再渲染官方统计行；
  //   - 数据来自官方 useProjection（sessionStats/tokenUsage），实时、跨版本稳定。
  slots.inject('conversation.composer.dock', () =>
    slots.register(
      { name: 'conversation.composer.dock', id: 'stats', order: 0, priority: -1 },
      StatsPanelEntry,
    ),
  )

  // 标题栏右侧：用 VS Code 打开当前项目目录按钮（取当前会话 cwd）。
  slots.inject('conversation.session.header.actions', () =>
    slots.register({
      name: 'conversation.session.header.actions',
      id: 'dsh-studio-vscode-open',
      priority: -10,
    }, VscodeOpenButton),
  )

  // 官方设置页「主题商店」面板（id 专属 → 官方设置页多一项）。
  slots.inject('settings.section', () =>
    slots.register(
      { name: 'settings.section', id: 'dsh-studio-webui-themes', priority: 40, label: () => '主题商店' },
      () => createElement(ThemeStorePanel, { controller }),
    ),
  )
}
