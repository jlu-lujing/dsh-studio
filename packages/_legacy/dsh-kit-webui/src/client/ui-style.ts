/** 共享 UI 样式（全部走官方 --dsw-* design tokens，自动适配深浅色）。 */

export const tk = {
  text: 'var(--dsw-alias-label-primary)',
  secondary: 'var(--dsw-alias-label-secondary)',
  tertiary: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l2)',
  cardBg: 'var(--dsw-alias-bg-layer-3)',
  accent: 'var(--dsw-alias-brand-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  radius: 12,
}

export const cardS = { border: '1px solid ' + tk.border, borderRadius: tk.radius, background: tk.cardBg }

export const ghostBtn = {
  padding: '5px 12px', borderRadius: 8, border: '1px solid ' + tk.border,
  background: 'transparent', color: tk.secondary, font: 'inherit', fontSize: 13, lineHeight: 1.5,
  cursor: 'pointer', whiteSpace: 'nowrap',
}

export const primaryBtn = {
  padding: '5px 14px', borderRadius: 8, border: '1px solid transparent',
  background: tk.accent, color: 'var(--dsw-alias-bg-layer-3)', font: 'inherit',
  fontSize: 13, lineHeight: 1.5, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600,
}

export const inputS = {
  flex: 1, minWidth: 140, padding: '6px 10px', borderRadius: 8,
  border: '1px solid ' + tk.border, background: 'transparent', color: tk.text,
  font: 'inherit', fontSize: 13,
}
