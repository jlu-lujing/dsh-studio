/** 主题编辑器（主题自己风格）+ 全局界面调整编辑器。 */
import { createElement, useState } from 'react'
import type { TokenModes, WebUITheme } from './themes.ts'
import {
  TOKEN_FIELDS, TOKEN_GROUPS, setTokenMode,
  DEFAULT_DARK_THEME_TOKENS, DEFAULT_LIGHT_THEME_TOKENS,
} from './themes.ts'
import {
  EXTRA_TOKEN_PREFIX, splitExtraTokens, mergeExtraTokens,
  splitExtraTokenModes, mergeExtraTokenModes,
  type ExtraToken, type ExtraTokenModes,
} from './custom-tokens.ts'
import { tk, cardS, ghostBtn, primaryBtn, inputS } from './ui-style.ts'

const colorInputS = { width: 34, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }

/*────────────────────────────── 主题编辑器 ──────────────────────────────*/
/* 编辑一个主题自己的风格：colorScheme 决定基础深浅模式，tokens 是单值（官方 ThemeDefinition 形状）。 */

function defaultsFor(scheme: 'light' | 'dark'): Record<string, string> {
  return { ...(scheme === 'dark' ? DEFAULT_DARK_THEME_TOKENS : DEFAULT_LIGHT_THEME_TOKENS) }
}

/** 分组标题：窗口 / 按钮与输入 / Markdown 与代码 / 状态 可分开设置。 */
function groupHeading(
  group: { label: string; description: string; fields: unknown[] },
  children: unknown,
  open = false,
) {
  return createElement('details', { open, style: { borderTop: '1px solid ' + tk.border, paddingTop: 10 } },
    createElement('summary', { style: { cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tk.text } },
      group.label + '（' + group.fields.length + '）'),
    createElement('div', { style: { fontSize: 11, color: tk.tertiary, marginTop: 2 } }, group.description),
    createElement('div', { style: { marginTop: 8 } }, children),
  )
}

export function ThemeEditor(props: {
  initial?: WebUITheme
  onSave: (t: WebUITheme) => void
  onCancel: () => void
}) {
  const { initial, onSave, onCancel } = props
  const [id, setId] = useState(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(initial?.colorScheme ?? 'dark')
  // 基础编辑：只对固定 TOKEN_FIELDS 用 color 控件（见 defaultsFor + 下方 map）。
  const [tokens, setTokens] = useState<Record<string, string>>(() => {
    const scheme = initial?.colorScheme ?? 'dark'
    const t = defaultsFor(scheme)
    for (const f of TOKEN_FIELDS) {
      const value = initial?.tokens[f.name]
      if (typeof value === 'string' && value !== '') t[f.name] = value
    }
    return t
  })
  // 额外 token（固定字段之外）：文本 key/value 行编辑，增删自由。
  const [extraTokens, setExtraTokens] = useState<ExtraToken[]>(() =>
    splitExtraTokens(initial?.tokens ?? {}),
  )

  const submit = () => {
    if (!id.trim() || !name.trim()) return
    onSave({
      id: id.trim().toLowerCase(),
      name: name.trim(),
      description: description.trim() || `${colorScheme === 'dark' ? '深色' : '浅色'} · 自定义主题`,
      colorScheme,
      builtin: false,
      tokens: mergeExtraTokens(tokens, extraTokens),
    })
  }

  return createElement('div', { style: { ...cardS, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 } },
    createElement('div', { style: { fontSize: 15, fontWeight: 600 } }, initial ? '编辑主题风格' : '新建主题风格'),
    createElement('div', { style: { fontSize: 12, color: tk.tertiary } },
      '这里是「这个主题自己」的部分：切换主题时整体风格随之变化；上面的「全局界面调整」对所有主题生效。切换深色底/浅色底会载入对应的默认配色。'),
    createElement('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
      createElement('input', {
        value: id, onChange: (e: { target: { value: string } }) => setId(e.target.value),
        placeholder: 'id（小写英数，唯一）', disabled: Boolean(initial), style: { ...inputS, maxWidth: 200 },
      }),
      createElement('input', {
        value: name, onChange: (e: { target: { value: string } }) => setName(e.target.value),
        placeholder: '名称', style: { ...inputS, maxWidth: 180 },
      }),
      createElement('input', {
        value: description, onChange: (e: { target: { value: string } }) => setDescription(e.target.value),
        placeholder: '一句话描述', style: { ...inputS, maxWidth: 220 },
      }),
      createElement('select', {
        value: colorScheme,
        onChange: (e: { target: { value: string } }) => {
          const next = e.target.value === 'light' ? 'light' : 'dark'
          setColorScheme(next)
          // 切换深浅底时载入对应模式默认配色，保证主题默认就适配该模式。
          setTokens(defaultsFor(next))
        },
        style: { ...inputS, maxWidth: 120 },
      },
        createElement('option', { value: 'dark' }, '深色底'),
        createElement('option', { value: 'light' }, '浅色底'),
      ),
    ),
    createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      TOKEN_GROUPS.map((g, gi) =>
        groupHeading(
          g,
          createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            g.fields.map((f) =>
              createElement('div', { key: f.name, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                createElement('label', { style: { width: 130, flex: 'none', fontSize: 12, color: tk.secondary } }, f.label),
                createElement('input', {
                  type: 'color', value: tokens[f.name] ?? '#888888',
                  onChange: (e: { target: { value: string } }) => setTokens((prev) => ({ ...prev, [f.name]: e.target.value })),
                  title: f.name, style: colorInputS,
                }),
                createElement('code', { style: { fontSize: 11, color: tk.tertiary } }, tokens[f.name] ?? ''),
                createElement('span', { style: { flex: 1, fontSize: 10, color: tk.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name),
              ),
            ),
          ),
          gi === 0,
        ),
      ),
    ),
    /* ── 额外 token：固定字段之外的 --dsw-alias-* 可自由增删 ── */
    createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        createElement('div', { style: { flex: 1, fontSize: 13, fontWeight: 600 } }, '额外 token'),
        createElement('button', {
          style: ghostBtn,
          onClick: () => setExtraTokens((prev) => [...prev, { key: EXTRA_TOKEN_PREFIX, value: '' }]),
        }, '＋ 添加'),
      ),
      createElement('div', { style: { fontSize: 11, color: tk.tertiary } },
        '固定字段之外的主题 token（key 以 -- 开头，常用 ' + EXTRA_TOKEN_PREFIX + ' 前缀）。留空 value 的行会被忽略。'),
      extraTokens.map((row, i) =>
        createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 8 } },
          createElement('input', {
            value: row.key,
            onChange: (e: { target: { value: string } }) => {
              const key = e.target.value
              setExtraTokens((prev) => prev.map((r, j) => (j === i ? { ...r, key } : r)))
            },
            placeholder: '--dsw-alias-xxx',
            style: { ...inputS, maxWidth: 300, fontFamily: 'monospace' },
          }),
          createElement('input', {
            value: row.value,
            onChange: (e: { target: { value: string } }) => {
              const value = e.target.value
              setExtraTokens((prev) => prev.map((r, j) => (j === i ? { ...r, value } : r)))
            },
            placeholder: '#rrggbb 或任意 CSS 值',
            style: { ...inputS, maxWidth: 260 },
          }),
          createElement('button', {
            style: { ...ghostBtn, color: tk.danger, borderColor: tk.danger, fontSize: 11, padding: '2px 10px' },
            onClick: () => setExtraTokens((prev) => prev.filter((_, j) => j !== i)),
            disabled: row.key === '' && row.value === '',
          }, '删除'),
        ),
      ),
    ),
    createElement('div', { style: { display: 'flex', gap: 10, justifyContent: 'flex-end' } },
      createElement('button', { style: ghostBtn, onClick: onCancel }, '取消'),
      createElement('button', { style: primaryBtn, onClick: submit, disabled: !id.trim() || !name.trim() }, initial ? '保存' : '创建'),
    ),
  )
}

/*────────────────────────── 全局界面调整编辑器 ──────────────────────────*/
/* 全局层 = 官方 overrideTokens({light,dark})：叠加在任意主题之上，自动跟随深浅模式。 */

export function GlobalAdjuster(props: {
  tokens: Record<string, TokenModes>
  onChange: (next: Record<string, TokenModes>) => void
  onReset: () => void
}) {
  const { tokens, onChange, onReset } = props

  const setOne = (name: string, mode: 'light' | 'dark', value: string) => {
    // 双模式归一化：另一模式为空时回填同值，避免切模式时 token 失效。
    onChange(setTokenMode(tokens, name, mode, value))
  }

  // 额外 token（固定字段之外）：双值 light/dark 行编辑，源数据来自 props（受控）。
  const extraModes = splitExtraTokenModes(tokens)
  const setExtraKey = (i: number, key: string): void => {
    const next = extraModes.map((r, j) => (j === i ? { ...r, key } : r))
    onChange(mergeExtraTokenModes(tokens, next))
  }
  const setExtraMode = (i: number, mode: 'light' | 'dark', value: string): void => {
    const next = extraModes.map((r, j) =>
      j === i ? { ...r, value: { ...r.value, [mode]: value } } : r,
    )
    onChange(mergeExtraTokenModes(tokens, next))
  }
  const removeExtra = (i: number): void => {
    const next = extraModes.filter((_, j) => j !== i)
    onChange(mergeExtraTokenModes(tokens, next))
  }
  const addExtra = (): void => {
    onChange(mergeExtraTokenModes(tokens, [
      ...extraModes,
      { key: EXTRA_TOKEN_PREFIX, value: { light: '', dark: '' } },
    ]))
  }

  return createElement('div', { style: { ...cardS, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 } },
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      createElement('div', { style: { flex: 1 } },
        createElement('div', { style: { fontSize: 15, fontWeight: 600 } }, '全局界面调整'),
        createElement('div', { style: { fontSize: 12, color: tk.tertiary, marginTop: 2 } },
          '与主题无关：无论切到哪个主题都叠加生效，并为浅色/深色各存一套值。',
        ),
      ),
      createElement('button', { style: ghostBtn, onClick: onReset }, '清空调整'),
    ),
    createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      TOKEN_GROUPS.map((g, gi) =>
        groupHeading(
          g,
          createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            g.fields.map((f) =>
              createElement('div', { key: f.name, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                createElement('label', { style: { width: 130, flex: 'none', fontSize: 12, color: tk.secondary } }, f.label),
                createElement('input', {
                  type: 'color', value: tokens[f.name]?.light ?? '',
                  onChange: (e: { target: { value: string } }) => setOne(f.name, 'light', e.target.value),
                  title: '浅色模式取值', style: colorInputS,
                }),
                createElement('span', { style: { fontSize: 11, color: tk.tertiary, width: 20 } }, '浅'),
                createElement('input', {
                  type: 'color', value: tokens[f.name]?.dark ?? '',
                  onChange: (e: { target: { value: string } }) => setOne(f.name, 'dark', e.target.value),
                  title: '深色模式取值', style: colorInputS,
                }),
                createElement('span', { style: { fontSize: 11, color: tk.tertiary, width: 20 } }, '深'),
                createElement('code', { style: { fontSize: 11, color: tk.tertiary } }, f.name),
              ),
            ),
          ),
          gi === 0,
        ),
      ),
    ),
    /* ── 全局层额外 token：固定字段之外的 --dsw-alias-*（浅色/深色双值） ── */
    createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        createElement('div', { style: { flex: 1, fontSize: 13, fontWeight: 600 } }, '额外 token'),
        createElement('button', {
          style: ghostBtn,
          onClick: addExtra,
        }, '＋ 添加'),
      ),
      createElement('div', { style: { fontSize: 11, color: tk.tertiary } },
        '固定字段之外的主题 token（key 以 -- 开头）。浅色/深色都留空的行会被忽略。'),
      extraModes.map((row, i) =>
        createElement('div', { key: `${i}-${row.key}`, style: { display: 'flex', alignItems: 'center', gap: 8 } },
          createElement('input', {
            value: row.key,
            onChange: (e: { target: { value: string } }) => setExtraKey(i, e.target.value),
            placeholder: '--dsw-alias-xxx',
            style: { ...inputS, maxWidth: 300, fontFamily: 'monospace' },
          }),
          createElement('span', { style: { fontSize: 11, color: tk.tertiary, width: 16 } }, '浅'),
          createElement('input', {
            value: row.value.light,
            onChange: (e: { target: { value: string } }) => setExtraMode(i, 'light', e.target.value),
            placeholder: '#rrggbb',
            style: { ...inputS, maxWidth: 110, fontFamily: 'monospace' },
          }),
          createElement('span', { style: { fontSize: 11, color: tk.tertiary, width: 16 } }, '深'),
          createElement('input', {
            value: row.value.dark,
            onChange: (e: { target: { value: string } }) => setExtraMode(i, 'dark', e.target.value),
            placeholder: '#rrggbb',
            style: { ...inputS, maxWidth: 110, fontFamily: 'monospace' },
          }),
          createElement('button', {
            style: { ...ghostBtn, color: tk.danger, borderColor: tk.danger, fontSize: 11, padding: '2px 10px' },
            onClick: () => removeExtra(i),
            disabled: row.value.light === '' && row.value.dark === '',
          }, '删除'),
        ),
      ),
    ),
  )
}
