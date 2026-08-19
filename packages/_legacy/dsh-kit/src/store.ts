/** Feature catalog: every dsh-kit-* feature the aggregate exposes. */

export interface Feature {
  /** Cordis row id in the aggregate patch (also the feature package name). */
  id: string
  /** Human-readable name shown in the store panel. */
  name: string
  /** One-line description shown in the store panel. */
  description: string
  /** Default on/off when no explicit state is recorded (default true). */
  defaultEnabled?: boolean
  /** Whether the store offers an install/delete action for this feature. */
  installable?: boolean
  /**
   * Whether the store offers an enable/disable toggle button for this feature.
   * Defaults to true. Set to false for features whose on/off is driven purely
   * by an on-disk artifact (e.g. the anchored-standard preset installer), which
   * should only offer install/delete.
   */
  togglable?: boolean
}

export type FeatureId = Feature['id']

export const FEATURES: readonly Feature[] = [
  {
    id: 'dsh-kit-notifier',
    name: '桌面通知',
    description: '任务完成 / 需要关注时发送桌面通知',
  },
  {
    id: 'dsh-kit-scheduler',
    name: '定时任务',
    description: '按 cron 表达式周期执行任务',
  },
  {
    id: 'dsh-kit-lan-auth',
    name: '局域网鉴权网关',
    description: '自签名 HTTPS 网关：本机免登录，局域网 token/登录访问',
    defaultEnabled: false,
  },
  {
    id: 'dsh-kit-input-history',
    name: '输入历史',
    description: '记录当前会话发送的消息，输入框无命令菜单时用 ↑/↓ 切换回填',
  },
  {
    id: 'dsh-kit-webui',
    name: 'WebUI 主题商店',
    description: '全局界面调整（对所有主题生效）+ 各主题独立风格；内置海洋/樱/森林三套深浅色预设，支持自定义主题',
  },
  {
    id: 'dsh-kit-worktree',
    name: 'git Worktree',
    description: '会话 worktree 归属：新建会话页选择 main 或 .dsh/worktree/<branch>（可新建），对话顶部显示归属徽标',
  },
  {
    id: 'dsh-boost-mode',
    name: 'TurboBoost Mode',
    description: 'TurboBoost Mode（满血模式）：Minimal 工具引导（bash/str_replace_editor）→ 首次晋升后开放完整工具；导入 preset 到 ~/.dsh/.agent-presets/boost-mode，并安装 J-Space 认知协议 skill（~/.dsh/skills/j-space，长任务/深度推理可 skill_load j-space）',
    defaultEnabled: true,
    installable: true,
    togglable: false,
  },
]
