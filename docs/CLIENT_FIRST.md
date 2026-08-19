# CLIENT-FIRST 结构说明

DSH Studio 是一个**完整的桌面客户端**，围绕「装一个 App、全家桶即用」组织仓库。
本文说明当前 monorepo 的「以客户端为主」结构和演进原则。

## 为什么是"客户端为主"

DSH Studio 不是一个松散的 npm 插件集合，而是一个交付给终端用户的开箱即用桌面产品：

- 用户拿到的是一个 **App**（Electron 客户端壳 + 内置 dsh 运行时）；
- 启动即自动装配 `dsh-studio` 全家桶插件，所有能力开箱即用；
- 传统 dsh 插件形态（通过 `dsh plugin add` 单装）仍受支持，作为客户端之外的兼容入口。

因此仓库的根叙事、发布、CI、文档都以**客户端交付**为中心，插件包只是其中的一层。

## 目录编排

```
dsh-studio/
├── apps/
│   ├── desktop/            # 客户端本体（Electron 壳：主进程/preload/renderer/通路）
│   └── dsh-runtime/        # 客户端内置的 dsh 独立运行时（构建发行物，随 App 分发）
├── packages/
│   └── dsh-studio/         # 全家桶插件单包（客户端功能真身，也是 npm 发布物）
├── scripts/                # 客户端/插件开发、构建、发布辅助脚本
├── .github/workflows/      # CI（workspace 门禁）+ 发布（npm + 桌面发行物）
├── docs/                   # 架构、桌面端、迁移、验证文档
└── package.json            # workspace 根（仅开发工具链，private）
```

## 各部分职责

### `apps/desktop` — 客户端壳（消费端）

Electron 桌面应用：
- 解析/复用/自管 `dsh` 实例（复用外部 `127.0.0.1:3080`，否则自管 `dsh web --port 0`）；
- 无边框透明窗口、标题栏、托盘、开机自启、多窗口、自动更新（feed + sha512 + 原子切换 + 回滚）；
- 依赖 `apps/dsh-runtime` 出厂内置运行时；首启自动把 `packages/dsh-studio` 装进用户 web profile。

### `apps/dsh-runtime` — 内置运行时（分发型）

把已验证的 `@deepseek-ai/dsh` 全依赖树 + 官方 Node 二进制打成独立运行时目录，
供桌面端 spawn，**用户无需单独安装 dsh**。构建期把 `packages/dsh-studio` 的
发布物（`lib/bin/preset/cordis.patch.yml/...`）一并 bundle 进 `node_modules/dsh-studio`，
使桌面端离线可用、版本锁死。

### `packages/dsh-studio` — 全家桶插件（功能层）

单一 npm 包，聚合：
- 聚合底座（功能商店、归档会话、生态目录、preset 管理器）；
- 六个功能子模块：notifier / scheduler / worktree / lan-auth / input-history / webui（主题商店）；
- 内置满血模式（TurboBoost Mode）preset + J-Space 认知协议 skill。

### 根 — 开发工具链（不发布）

根 `package.json` 为 workspace 根（`private: true`），只承载
`pnpm dev` / `build` / `typecheck` / `test` 等开发者命令，不发布到 npm。

## 演进原则

1. **客户端第一**：新能力默认先想「对用户（App 使用体验）意味着什么」，再落到插件层。
2. **发布拆分**：npm 发布物 = `packages/dsh-studio`；桌面发布物 = `apps/*` 的发行物（GitHub Releases）。
3. **路径稳定**：根脚本、CI、runtime build 均按现有 `apps/` / `packages/` 路径解析，
   新增目录不改动这些既成契约。
4. **历史归档**：`packages/_legacy/` 是旧 7 包备份，只读、不进 workspace、不发布。
