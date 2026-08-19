<p align="center">
  <img src="apps/desktop/build/dsh-logo.svg" alt="DSH Studio" width="120" />
</p>

<div align="center">

# DSH Studio

**一个完整的桌面客户端 · 一路护航 DSH**

开箱即用的桌面软件：Electron 客户端壳 + 内置 dsh 运行时 + 全家桶插件，
装一个 App，全部能力即开。

`MIT License` · 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

</div>

---

## ✨ 这是什么

`DSH Studio` 是一个**以桌面客户端为主的 DSH 套件**——不是散装的插件集合，而是一个
开箱即用的完整产品：

| 层 | 目录 | 作用 |
| --- | --- | --- |
| 🖥️ **桌面客户端** | `apps/desktop` | Electron 壳：启动内置 dsh、加载本地 Web UI、托盘、自启、多窗口、自动更新 |
| ⚙️ **内置运行时** | `apps/dsh-runtime` | 自带 Node + `@deepseek-ai/dsh` 全依赖树的独立运行包子模块，离线可用 |
| 🧩 **全家桶插件** | `packages/dsh-studio` | 单一 npm 包聚合全部功能（UI 增强、自动化、局域网网关、主题商店、worktree、满血模式…） |

用户**无需单独安装 dsh**——装一个 App，启动即自动装配全家桶，全部功能开箱即用。

- **开箱即用**：桌面端首启自动装配全家桶，装一个 App 即可
- **全家桶**：工具、UI 增强、自动化等能力全部内置
- **可拔插**：每个功能是内置子模块，可单独启停（host 与 client 界面跟随开关）
- **可扩展**：功能商店面板一键管理启停

---

## 🖥️ 桌面客户端

DSH Studio 桌面端是一个 Electron 应用（方案与演进见 [`docs/DESKTOP.md`](docs/DESKTOP.md)）：

- **自带运行时，免安装 dsh**——内置 `apps/dsh-runtime`，启动便拉起 `dsh web`；
- **智能复用**——先探测 `127.0.0.1:3080` 是否已有健康 dsh 实例，有则直接复用（不干预你已有的实例），无则自管拉起 `dsh web --port 0`；
- **无边框透明窗口** + 本地渲染的 DSH Studio 品牌界面，多窗口共享同一 dsh 后台；
- **托盘 / 开机自启** / 单实例锁；
- **自动更新链路**（M4/M5）：拉取 `feed.json` → 下载 runtime 升级包 → sha512 校验 → 纯 JS 解压到 `next/` → 冒烟 → 原子切换 `current ↔ previous`，失败自动回滚；**不碰已签名 App 包**；
- **安全边界**：运行期仅放行同 origin，外部导航交给系统浏览器；
- 只对**自管**实例自动装配全家桶 / 自动更新；复用外部实例时完全不干预你的配置。

---

## 📦 全家桶特性

> 六个功能都是 `dsh-studio` 包内的内置子模块（见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)），
> 不再是独立的 npm 包——装一个包全部开箱即用。

### 🎨 WebUI 主题商店
- **全局界面调整**：叠加层改任意 token（浅/深双套值），切主题也生效；
- **每主题独立风格**：海洋 / 樱 / 森林三套预设（深/浅双版），可自定义主题新建/编辑/删除；
- 持久化到 `~/.dsh/dsh-studio-webui/themes.json`，重启自动恢复。
> 验收记录见 [`docs/THEME_STORE_VERIFICATION.md`](docs/THEME_STORE_VERIFICATION.md)。

### 🔔 桌面通知
- 监听回合结束，跨平台通知（macOS / Linux / Windows），零 npm 依赖。

### ⏰ 定时任务（scheduler）
- cron 定时任务 + 持久化 + 管理路由，支持 shell 命令。

### 🌐 局域网鉴权网关（lan-auth）
- HTTPS 反向代理 + token/账号密码登录，默认关闭；
- 私有 CA 零配置自动生成（SAN 覆盖本机全部局域网 IP），登录页引导下载 `.crt` 免警告；
- 本机 loopback 免登录直通，管理路由仅本机可达；登出即刊销 token 并清 cookie。

### ⌨️ 输入历史（input-history）
- 记录**当前会话**发送的消息，输入框无命令菜单时按 ↑/↓ 回填（每个会话单独记忆）。

### 🌿 git Worktree 会话归属
- 会话按 cwd 判定 `main` 或 `.dsh/worktree/<branch>`；
- 新建会话可选已有 / 新建 worktree；对话顶部显示归属徽标。

### 📋 归档会话管理
- DSH 只隐藏归档会话，dsh-studio 补齐**恢复**与**彻底删除**（含二次确认，落盘 `workspace.json`）。

### 🔍 GitHub 生态目录
- 功能商店底部只读展示 `topic:dsh-plugin` 生态仓库，按 Star 降序；
- 首次秒出 Top 100，后台补全并 30 分钟缓存；网络受限回退内置快照。

### 🚀 Boost Mode（满血模式）· 内置 preset
- 基于 [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) 二阶段 agent preset：**Minimal 引导 → 首次持久晋升信号后开放完整工具目录**；
- 内置 `packages/dsh-studio/preset/`，默认开启，自动导入 `~/.dsh/.agent-presets/boost-mode`；更重的工具按需 “discovery” 解锁（`dev_tool_search` / `skill_search` / `skill_load`）。

---

## 🗂️ 仓库结构

```
dsh-studio/
├── apps/
│   ├── desktop/          # 桌面客户端（Electron 壳，客户端本体）
│   └── dsh-runtime/      # 内置 dsh 独立运行时（自带 Node + dsh 全依赖树）
├── packages/
│   └── dsh-studio/       # 全家桶插件单包（聚合 + 六个功能子目录，发布 npm）
├── scripts/              # 客户端/插件开发与构建脚本
├── docs/                 # 架构 / 桌面端 / 迁移 / 验证 文档
├── .github/workflows/    # CI（build/typecheck/test）+ 发布 workflow
├── package.json          # workspace 根
└── pnpm-workspace.yaml   # pnpm workspace
```

---

## 🚀 快速开始

### 方式一：发布版（全新系统装全家桶）

装一个包 = 用 DSH 的原生插件命令把 `dsh-studio` 加进某个 profile：

```sh
dsh plugin --profile web add -w dsh-studio
```

`dsh-studio` 内部按功能分子目录，满血模式（Boost Mode）preset 内置——真正「装一个包，全家桶开箱即用」。

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
- 停用的功能 host 侧不挂载（路由/定时器/网关不运行），client 侧界面也不注册。
- 也可在设置页「功能商店」面板一键启停。

> 详情见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

---

## 💻 开发

```sh
pnpm dev              # 双 watch：client 热构建 + host tsc watch（重启 dsh 生效）
pnpm build            # 全量构建（host tsc + client tsdown）
pnpm build:client     # 补齐 dsh.client 的 lib/client.js
pnpm typecheck        # 类型检查
pnpm test             # 测试

# 桌面端开发
pnpm desktop:dev      # electron-vite 热重载
pnpm desktop:pack     # 打包（electron-builder --dir）
pnpm runtime:build    # 构建内置 dsh 运行时发行物
pnpm runtime:smoke    # 运行时冒烟
```

> 注意：`pnpm build` 已包含 host 编译；client bundle 仍需 `pnpm build:client`（或 `pnpm dev`）产出。
> `dsh-studio` 的 host tsc 会排除 `src/**/client/`，cient 由 tsdown 单独产出 `lib/client.js`。

新插件可用官方脚手架生成，再移入 `packages/`：

```sh
npx create-dsh-plugin my-plugin -t tool
```

---

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

- **满血模式（Boost Mode）preset**：基于 [dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) 的二阶段 agent preset，由 dsh-studio 的导入/删除管理器（`src/preset.ts`）打包分发。
- **GitHub 生态目录**的分片抓取/缓存思路参考 [0xKcyzz/dsh-plugin-store](https://github.com/0xKcyzz/dsh-plugin-store)（MIT）；dsh-studio 只取展示能力，不做安装。
  - 简介：首次请求用 Minimal 工具对（`bash` / `str_replace_editor`），首次持久晋升信号后开放完整工具目录。
  - 全家桶接入：内置 `packages/dsh-studio/preset/`，默认开启，自动导入到 `~/.dsh/.agent-presets/boost-mode`；功能商店可手动导入/删除。

## License

本项目遵循 [MIT License](LICENSE)。

- Copyright (c) 2026 **Lu Jing**
