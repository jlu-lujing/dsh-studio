/** 主题商店设置页面板：官方主题 + 内置预设，统一在一个面板选择（配置持久化统一）。 */
import { createElement, useEffect, useState } from 'react'
import { tk } from './ui-style.ts'
import { ThemeCard } from './ui-card.ts'
import type { ThemeStoreController } from './controller.ts'

function Section({ title, hint, children }: { title: string; hint?: string; children: unknown }) {
  return createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
    createElement('div', { style: { fontSize: 13, fontWeight: 600, color: tk.secondary } }, title),
    hint ? createElement('div', { style: { fontSize: 11, color: tk.tertiary } }, hint) : null,
    children,
  )
}

export function ThemeStorePanel({ controller }: { controller: ThemeStoreController }) {
  const [, force] = useState(0)

  useEffect(() => controller.subscribe(() => force((x) => x + 1)), [controller])

  const themes = controller.themes
  const activeId = controller.activeId
  const officialThemes = themes.filter((t) => t.kind === 'official')
  const presetThemes = themes.filter((t) => t.kind !== 'official' && t.builtin)

  const card = (t: { id: string; name: string }) =>
    createElement(ThemeCard, {
      key: t.id,
      theme: t as never,
      active: t.id === activeId,
      onApply: (id) => controller.applyTheme(id),
      onEdit: () => {},
      onDelete: () => {},
    })

  return createElement('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 } },
    createElement('div', { style: { fontSize: 16, fontWeight: 600 } }, '主题商店'),
    createElement('div', { style: { fontSize: 12, color: tk.tertiary } },
      '统一在这里选择主题（官方与自定义预设同源持久化，重启不丢失）。',
    ),

    createElement(Section, { title: '官方主题', hint: '跟随系统 / 官方深浅色（DSH 默认外观）' },
      createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 } },
        officialThemes.map(card),
      ),
    ),

    createElement(Section, { title: '预设风格', hint: '内置配色预设，深/浅两版' },
      createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 } },
        presetThemes.map(card),
      ),
    ),

    createElement('div', { style: { fontSize: 11, color: tk.tertiary } },
      '当前使用：' + (themes.find((t) => t.id === activeId)?.name ?? activeId ?? '跟随系统'),
    ),
  )
}
