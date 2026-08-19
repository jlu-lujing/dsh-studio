<div align="center">

# DSH Studio

**一个完整的桌面客户端 · 一路护航 DSH**

开箱即用的桌面软件：Electron 客户端壳 + 内置 dsh 运行时 + 全家桶插件，装一个 App，全部能力即开。

`MIT License` · Language: [中文](#) · 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

</div>

---

## ✨ 项目定位

`DSH Studio` 是一个**以客户端为主**的 DSH 桌面套件，包含三层：

1. **桌面客户端**（`apps/desktop`）—— Electron 壳：启动内置 dsh、加载本地 Web UI、托盘/自启/多窗口/自动更新，开箱即用，用户无需单独安装 dsh。
2. **内置运行时**（`apps/dsh-runtime`）—— 自带的 dsh 独立运行包子模块（自带 Node + `@deepseek-ai/dsh` 全依赖树），产出发行物并随客户端分发，离线可用。
3. **全家桶插件**（`packages/dsh-studio`）—— 单一 npm 包聚合全部功能：UI 增强、自动化、局域网网关、主题商店、worktree 会话归属、满血模式 preset 等，可单独启停。

- **开箱即用**：桌面端首启自动装配全家桶，装一个 App 即可
- **全家桶**：工具、UI 增强、自动化等能力全部内置
- **可拔插**：每个功能是内置子模块，可单独启停（host 与 client 界面跟随开关）
- **可扩展**：功能商店面板一键管理启停

---

```
dsh-studio/
├── apps/
│   ├── desktop/          # 桌面客户端（Electron 壳，客户端本体）
│   └── dsh-runtime/      # 内置 dsh 独立运行时（自带 Node + dsh 全依赖树）
├── packages/
│   └── dsh-studio/       # 全家桶插件单包（聚合 + 六个功能子目录，发布 npm）
├── scripts/              # 客户端/插件开发与构建脚本
├── .github/workflows/    # CI（build/typecheck/test）+ 发布 workflow
├── docs/                 # 架构 / 桌面端 / 迁移 文档
├── package.json          # workspace 根
└── pnpm-workspace.yaml   # pnpm workspace
```

## 📦 功能清单

| 组件 | 功能 | 说明 |
| --- | --- | --- |
| `dsh-studio` | 单包聚合 | host 管理 CLI + 设置页「功能商店」+「归档会话」管理 + 内置 preset 管理器；六功能子模块 |
| 桌面通知 | 内置子模块 | 监听回合结束，跨平台通知（macOS/Linux/Windows），零 npm 依赖 |
| 定时任务 | 内置子模块 | cron 定时任务 + 持久化 + 管理路由（支持 shell 命令） |
| 局域网鉴权网关 | 内置子模块 | HTTPS 反向代理 + token/登录，默认关闭；私有 CA 零配置自动生成 |
| 输入历史 | 内置子模块 | 记录**当前会话**发送的消息，输入框无命令菜单时按 ↑/↓ 切换回填（每个会话单独记忆） |
| WebUI 主题商店 | 内置子模块 | **全局界面调整** + **每主题独立风格**；内置海洋/樱/森林三套预设（深/浅双版），支持自定义主题 |
| git Worktree 会话归属 | 内置子模块 | 会话按 cwd 判定 `main` 或 `.dsh/worktree/<branch>`；新建会话可选已有/新建 worktree，对话顶部显示归属徽标 |
| TurboBoost Mode（满血模式） | 内置 preset | 二阶段 agent preset（Minimal 引导 → 首次晋升开放完整工具）；附 J-Space 认知协议 skill |
| GitHub 生态目录 | 内置 | `topic:dsh-plugin` 仓库只读展示 |
| 归档会话管理 | 内置 | 归档会话恢复 / 删除 |

> 💡 六个功能都是 `dsh-studio` 包内的子模块（见 `docs/ARCHITECTURE.md`），不再是独立 npm 包。

---

## 🚀 快速开始

### 方式一：发布版（全新系统装全家桶）

装一个包 = 用 DSH 的原生插件命令把 `dsh-studio` 加进某个 profile：

```sh
dsh plugin --profile web add -w dsh-studio
```

`dsh-studio` 内部按功能分子目录，满血模式（TurboBoost Mode）preset 内置——真正「装一个包，全家桶开箱即用」。

> 💡 **关键**：`dsh-studio install` 命令**并不是**全新系统的入口。它内部只是执行上面这条 `dsh plugin ... add -w dsh-studio`；要运行 `dsh-studio` 命令，你得先装上 `dsh-studio` 这个 npm 包（其 `bin` 进入 PATH）。全新系统直接用上面的 `dsh plugin` 命令。

### 方式二：本地源码调试（推荐隔离环境）

```sh
# 1. 安装依赖并构建
pnpm install
pnpm build
pnpm build:client    # 产 client bundle

# 2. 装进 dev profile（单包 link，替换为你的仓库实际路径）
dsh plugin --profile dev add -w /path/to/dsh-studio/packages/dsh-studio

# 3. 启动 dsh web
dsh web
```

---

## 🛠️ 插件管理

装好全家桶后，用 `dsh-studio` 命令管理各功能开关：

```sh
dsh-studio list                                     # 列出所有功能及状态
dsh-studio enable dsh-studio-notifier              # 启用桌面通知
dsh-studio disable dsh-studio-scheduler            # 停用定时任务
dsh-studio install [--profile <p>]                  # 把全家桶装进指定 profile（默认 web）
# 注：需要系统里已有 dsh-studio 命令；全新系统请用: dsh plugin --profile web add -w dsh-studio
```

- 状态保存在 `~/.dsh/dsh-studio/state.json`，**重启后保留**。
- 每个功能的启停由 host 单入口按 state 决定，**无需编辑任何 patch 文件**。
- 停用的功能 host 侧不挂载（路由/定时器/网关不运行），client 侧界面也不注册（见 `docs/ARCHITECTURE.md`）。
- 也可以通过设置页「功能商店」面板一键点按开关。

### GitHub 生态目录（只读展示）

功能商店底部会展示 GitHub `topic:dsh-plugin` 生态仓库，按 **Star 数降序**排列，点击卡片打开仓库主页（安装方式各不相同，请以各仓库 README 为准，暂不提供一键安装）。

- 首次打开先秒出 Top 100，随后后台补全完整目录并写入 30 分钟磁盘缓存。
- 网络受限时自动回退到包内置快照；可配置 `GITHUB_TOKEN` 提升 GitHub API 限流。
- 目录抓取策略参考 [0xKcyzz/dsh-plugin-store](https://github.com/0xKcyzz/dsh-plugin-store)（MIT）。

### 归档会话管理

DSH 官方的「归档」只会把会话从列表隐藏、保留日志；dsh-studio 在设置页新增「归档会话」面板，补齐恢复与彻底删除：

- **恢复**：把会话从 `archivedSessionIds` 移除，回到原工作区分组。
- **删除**：从归档集和所有 workspace 的 `sessionIds` 摘除，并删除 `~/.dsh/sessions` 下对应日志目录；**不可恢复，UI 有二次确认**。
- 操作直接落盘到 `~/.dsh/storages/workspace.json`；dsh 运行期以内存态为准，**操作后需重启 dsh 生效**。

### WebUI 主题商店

> 完整验收记录见 [`docs/THEME_STORE_VERIFICATION.md`](docs/THEME_STORE_VERIFICATION.md)。

设置页新增「主题商店」面板。它**不替换官方主题**，而是跑在官方 `ui-theme` 的两个公开扩展点上：

- **全局界面调整**：走官方 `ctx.theme.overrideTokens()` 叠加层——与主题无关，切到任何主题都生效；每个 token 分别保存浅色/深色两套值，随当前模式自动取值。
- **主题风格**：走官方 `ctx.theme.register()` + `setTheme()`——每个主题有自己独立的 `--dsw-alias-*` token 集合；预设按「家族」提供深色版 + 浅色版，自定义主题可新建/编辑/删除。
- **持久化**：自定义主题与全局调整写入 `~/.dsh/dsh-studio-webui/themes.json`（host 路由 `/dsh-studio-webui/themes` 管理），当前所选主题另存 localStorage；重启 dsh 后自动恢复。
- **开关**：功能商店面板 / `dsh-studio disable dsh-studio-webui` 可整体停用；停用后设置页不出现该面板，host 路由与 client 一并下线。

---

## 💻 开发

```sh
pnpm dev              # 双 watch：client 热构建 + host tsc watch（自动重编译，重启 dsh 生效）
pnpm build            # 全量构建（host tsc + client tsdown）
pnpm build:client     # 补齐 dsh.client 的 lib/client.js
pnpm typecheck        # 类型检查
pnpm test             # 测试
```

> 注意：`pnpm build` 已包含 host 编译；client bundle 仍需 `pnpm build:client`（或 `pnpm dev`）产出。换机器/重新 clone 后建议两者都跑一遍。
> `dsh-studio` 的 host tsc 会排除 `src/**/client/`，client 由 tsdown 单独产出 `lib/client.js`。

新插件可用官方脚手架生成，再移入 `packages/`：

```sh
npx create-dsh-plugin my-plugin -t tool
```

---

## 🔒 局域网远程访问（局域网鉴权网关）

启用后，局域网设备经 `https://<主机IP>:3443` + token 访问。

- **证书（零配置）**：首启自动生成私有 CA（根 `ca.pem` + 叶子，SAN 覆盖本机全部局域网 IP）。登录页引导下载 `.crt` 永久免警告。
- **安全模型**：本机 loopback 免登录直通；局域网需有效 token 或账号密码登录；管理路由仅本机可达。
- **登出**：远程会话登出按钮带二次确认；登出即吊销会话 token 并清 cookie。
- **管理**：`dsh-studio-lan-auth init-ca [--ip ...]` / `dsh-studio-lan-auth status`

## 🖥️ 桌面客户端（Electron + 内置 dsh-runtime）

独立桌面软件（Electron 壳 + 内置 dsh-runtime 子模块，**用户无需单独装 dsh**，已在 main 合入）。方案与演进见 `docs/DESKTOP.md`。

- **M1–M5 已落地并真机验证**（2026-08-16）：
  - `apps/dsh-runtime`：从本机已验证 dsh 构建独立运行时。自带官方 Node 二进制（方案 B）为目标态；当前 MVP 走 **Electron 内置 Node（方案 A）**，本地构建用 `build.mjs --skip-node-download` + `scripts/smoke.mjs` 冒烟
  - `apps/desktop`：Electron 壳（electron-vite + electron-builder）——spawn/就绪 URL/BrowserWindow/退出清理、托盘、开机自启、错误页、更新链路（feed + sha512 + 原子切换 + 回滚）
  - **开箱即用**：自管 dsh 实例就绪后，后台检测 web profile 并自动装 dsh-studio（`dsh plugin --profile web add -w dsh-studio`）；仅对自管实例执行，复用外部 `3080` 实例时不干预用户已有配置

**启动方式**（任选其一）：

```sh
# 方式一：打包好的 App（本机构建）
open "apps/desktop/dist/mac-arm64/DSH Studio.app"

# 方式二：开发模式（electron-vite，热重载）
cd apps/desktop
npm install && npm run dev
```

> 💡 **常见坑**：`npm install` 装了 electron 包但二进制没下载时，`npm run dev` 会报
> `Error: Electron uninstall`（缺 `node_modules/electron/dist` 与 `path.txt`）。手动跑一次
> `node node_modules/electron/install.js` 即可补下二进制。
>
> 客户端启动时会先探测 `127.0.0.1:3080` 是否已有健康 dsh 实例，有则**直接复用**；无则自己
> 拉起 `dsh web --port 0` 并等待就绪 URL。日志在 `~/Library/Application Support/@dsh-studio/desktop/desktop.log`。

## 📤 发布

**当前版本 `0.2.1`**（2026-08-19）：单一 npm 包 `dsh-studio`（`license: MIT`），桌面客户端/内置运行时随 GitHub Releases 分发。

- 根 workspace `private: true`，只承载开发工具链与客户端，不发布到 npm；发布物为 `packages/dsh-studio` 单一 npm 包 + `apps/desktop` / `apps/dsh-runtime` 的桌面发行物。

### GitHub Actions

- **`ci.yml`**：push / PR 自动跑 `pnpm -r build` → `typecheck` → `test`。
- **`release.yml`**：`workflow_dispatch` 手动触发，默认 **dry-run**；输入改为 `false` 才用 `NPM_TOKEN` 真实发布 npm 包，并用 `GITHUB_TOKEN` 产出桌面发行物到 GitHub Releases。发布前校验单包版本。

本地手动发布（仅备选；日常推荐走 CI）：

```sh
pnpm -r build && pnpm -r typecheck && pnpm -r test

# 先 dry-run 校验打包内容，再真实发布
pnpm -r publish --access public --no-git-checks --dry-run
pnpm -r publish --access public --no-git-checks
```

架构详见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、开发坑位详见 [`docs/HANDOFF.md`](docs/HANDOFF.md)。

---

## 📚 许可

- **满血模式（TurboBoost Mode）preset**：内置二阶段 agent preset，由 dsh-studio 的导入/删除管理器（`src/preset.ts`）打包分发。
- **J-Space 认知协议 skill**：随满血模式一起内置分发（`packages/dsh-studio/preset/j-space/`），安装 preset 时自动装入 `~/.dsh/skills/j-space/`；满血 persona 轻量引导模型在深度推理/长任务/工具重任务时用 `skill_load j-space` 按需加载。
- **GitHub 生态目录**的分片抓取/缓存思路参考 [0xKcyzz/dsh-plugin-store](https://github.com/0xKcyzz/dsh-plugin-store)（MIT）；dsh-studio 只取展示能力，不做安装。
  - 简介：首次请求用 Minimal 工具对（`bash` / `str_replace_editor`），首次持久晋升信号后开放完整工具目录。
  - 全家桶接入：内置 `packages/dsh-studio/preset/`，默认开启，自动导入到 `~/.dsh/.agent-presets/boost-mode`；功能商店可手动导入/删除。

## License

本项目遵循 [MIT License](LICENSE)。

- Copyright (c) 2026 **Lu Jing**
