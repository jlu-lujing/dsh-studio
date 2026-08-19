# dsh-studio-webui 主题商店 —— 验收记录

> 日期：2026-08-16
> 状态：全部通过（对应目标：全局界面调整 + 各主题独立风格 + 深浅色预设）

## 目标映射

| 目标要求 | 实现 | 官方扩展点 |
| --- | --- | --- |
| 全局主题可修改，与主题无关，应用到所有主题（界面调整） | 「主题商店」→「全局界面调整」，11 个语义 token 各存 `{ light, dark }` | `ctx.theme.overrideTokens('dsh-studio-webui.global', …)` |
| 每个主题自己自定义的部分 | 「主题风格」预设/我的主题，新建/编辑/删除/应用 | `ctx.theme.register({ id, colorScheme, tokens })` + `setTheme()` |
| 创建几种预设主题 | 3 家族 × 深浅 = 6 个 | `packages/dsh-studio-webui/src/client/themes.ts` |
| 主题适配深色和浅色 | 每家族 dark/light 变体；自定义编辑器切换底色自动载入对应默认配色 | `colorScheme: 'light' \| 'dark'` |

预设清单：`ocean-dark/light`、`sakura-dark/light`、`forest-dark/light`。

## 自动化验证

```sh
cd packages/dsh-studio-webui
pnpm test
```

结果：**10 tests / 10 pass / 0 fail**。覆盖：

- 预设家族、深浅变体、token 字段完整性
- localStorage 持久化与损坏回退
- `ThemeStoreController`：init 注册/active 恢复/全局层应用
- `setGlobal` 叠加更新与持久化
- `saveCustom` / 内置 id 冲突拒绝 / `deleteCustom` 回落官方 dark
- host `store.ts` JSON 往返与缺失回退
- `setTokenMode`：另一模式为空时自动回填同值

## 端到端验证（已执行）

```sh
# 隔离 DSH_HOME
DSH_HOME=/tmp/dsh-studio-webui-home dsh plugin --profile web add -w <6 包路径>
DSH_HOME=/tmp/dsh-studio-webui-home dsh web --port 3199
```

HTTP 层：

```text
GET  /                                    → 200
GET  /plugins/dsh-studio-webui/client.js     → 200
GET  /dsh-studio-webui/themes                → 200 {"themes":[]}
POST /dsh-studio-webui/themes                → 200 {"ok":true}
GET  /dsh-studio/store                       → features 含 dsh-studio-webui
```

`__DSH_BOOT__` 条目：

```json
{"id":"dsh-studio-webui","url":"/plugins/dsh-studio-webui/client.js?rev=…",
 "inject":["@deepseek-ai/dsh-client-connection","@deepseek-ai/dsh-client-ui-theme"]}
```

## 真实浏览器验证（已执行，可复跑）

```sh
# 启动隔离 dsh web 后，另开 Chrome CDP（端口 9223），然后：
cd packages/dsh-studio-webui
pnpm test:e2e
```

脚本：`test/browser-e2e.mjs`（可用 `DSH_URL` / `CDP_HTTP` 覆盖默认地址）。

1. 设置面板出现「主题商店」，点击后两部分渲染：
   `全局界面调整` + `主题风格 · 预设`。
2. 6 个预设全部显示。
3. 应用「海洋 Ocean · 深色」：
   `getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base')` → `#0b1220`。
4. 切换到「海洋 Ocean · 浅色」：同一 token → `#f4f8fc`。
5. 全局调整「品牌强调」浅色值改为 `#112233`：
   当前主题 `--dsw-alias-brand-primary` → `#112233`；
   localStorage 持久化为 `{"light":"#112233","dark":"#112233"}`。

输出：`BROWSER-DEEP-E2E-OK`。

## 发布路径验证

- `npm pack --dry-run`（dsh-studio-webui）：包含 README / client.js / host js / d.ts / package.json。
- `pnpm -r publish --access public --no-git-checks --dry-run`：6 包全部通过（含聚合包 dsh-studio）。
