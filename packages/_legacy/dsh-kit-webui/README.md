# dsh-kit-webui

DSH WebUI 主题商店（dsh-kit 全家桶功能包，由 `dsh-kit` 聚合包挂载）。

不替换官方主题，而是在官方 `ui-theme` 的公开扩展点上叠加两层能力：

## 1. 全局界面调整

- 走官方 `ctx.theme.overrideTokens('dsh-kit-webui.global', { light, dark })`；
- **与主题无关**：切到官方 light/dark/system 或本店任意主题都生效；
- 每个 token 分别保存浅色 / 深色两套值，随当前模式自动取值；
- 「清空调整」恢复原样。

## 2. 主题风格（每个主题自己的部分）

- 走官方 `ctx.theme.register({ id, colorScheme, tokens })` + `ctx.theme.setTheme(id)`；
- 内置预设按家族提供深色版 + 浅色版：
  - 海洋 Ocean：`ocean-dark` / `ocean-light`
  - 樱 Sakura：`sakura-dark` / `sakura-light`
  - 森林 Forest：`forest-dark` / `forest-light`
- 自定义主题：新建（id + 名称 + 深浅色底 + 11 个语义 token 颜色）→ 编辑 → 删除。

## 面板位置

- 设置页 →「主题商店」（`settings.section`，id `dsh-kit-webui-themes`）

## 持久化

- host 路由：`GET/POST /dsh-kit-webui/themes`、`POST /dsh-kit-webui/themes/delete`
- 落盘：`~/.dsh/dsh-kit-webui/themes.json`
- 浏览器侧：`localStorage`（`dsh-kit-webui.themes.v1`）
- 重启 dsh 后自动恢复上次所选主题与全局调整。

## 构建

```sh
pnpm build          # host tsc + client tsdown
pnpm build:client   # 仅产 lib/client.js
```

> 作为全家桶功能包，本包不声明 `dsh.bundle`；其 loader 行由 `dsh-kit` 的
> 聚合 patch 持有（避免 duplicate loader entry id）。整体开关：
> `dsh-kit enable|disable dsh-kit-webui`，或在功能商店面板点按。
