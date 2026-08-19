/** 主题卡片：只展示主题色（关键几色）+ 应用按钮，简洁的预设选择卡。 */
import { createElement } from 'react'
import type { WebUITheme } from './themes.ts'
import { tk, cardS, ghostBtn, primaryBtn } from './ui-style.ts'

/** 卡片上展示的「主题色」：取每个主题最有辨识度的几个关键色。 */
const KEY_TOKENS: Array<{ name: string; label: string }> = [
  { name: '--dsw-specific-sidebar-fill', label: '侧栏' },
  { name: '--dsw-alias-bg-base', label: '背景' },
  { name: '--dsw-alias-brand-primary', label: '强调' },
  { name: '--dsw-alias-state-success-primary', label: '成功' },
  { name: '--dsw-alias-state-warn-primary', label: '警告' },
]

export function ThemeCard(props: {
  theme: WebUITheme
  active: boolean
  onApply: (id: string) => void
  onEdit: (theme: WebUITheme) => void
  onDelete: (id: string) => void
}) {
  const { theme, active, onApply } = props
  const isOfficial = theme.kind === 'official'
  const swatches = isOfficial ? [] : KEY_TOKENS
    .map((k) => ({ label: k.label, value: theme.tokens[k.name] }))
    .filter((s): s is { label: string; value: string } => typeof s.value === 'string')

  // 官方主题：左侧显示模式图标（跟随系统=⚙ 切换 / 深色=🌙 / 浅色=☀）
  const officialGlyph = theme.id === 'system' ? '跟随' : theme.colorScheme === 'dark' ? '深' : '浅'
  const leftSwatch = isOfficial
    ? createElement('div', {
        style: {
          width: 34, height: 34, borderRadius: 8, flex: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          background: tk.cardBg, border: '1px solid ' + tk.border, color: tk.secondary,
        },
      }, officialGlyph)
    : createElement('div', { style: { display: 'flex', gap: 4, flex: 'none' } },
        swatches.map((s) =>
          createElement('span', {
            key: s.name,
            title: `${s.label}: ${s.value}`,
            style: {
              width: 10, height: 34, borderRadius: 3,
              background: s.value, border: '1px solid ' + tk.border,
            },
          }),
        ),
      )

  return createElement('div', {
    style: {
      ...cardS, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
      borderColor: active ? tk.accent : tk.border,
      boxShadow: active ? `0 0 0 1px ${tk.accent} inset` : undefined,
    },
  },
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      leftSwatch,
      createElement('div', { style: { flex: 1, minWidth: 0 } },
        createElement('div', { style: { fontSize: 14, fontWeight: 600 } }, theme.name),
        createElement('div', { style: { fontSize: 11, color: tk.tertiary, marginTop: 2 } },
          (isOfficial ? '官方主题' : (theme.colorScheme === 'dark' ? '深色底' : '浅色底'))
          + (active ? ' · 使用中' : '')),
      ),
    ),
    createElement('button', {
      style: { width: '100%', ...(active ? ghostBtn : primaryBtn) },
      onClick: () => onApply(theme.id),
    }, active ? '使用中' : '应用这个主题'),
  )
}
