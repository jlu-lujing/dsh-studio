# DSH Studio Desktop 桌面客户端设计

> 更新日期：2026-08-16
> 状态：M1–M5 已落地并联调（dsh-runtime 子模块 / Electron 壳 / 打包注入 / 更新链路 / 托盘·自启·错误页），见 §9；签名/公证待证书
> 分支：`main`（已合入）

## 1. 定位

DSH Studio Desktop 是一个**独立桌面软件**：

- 用户**不需要单独安装 dsh**（dsh 内置在应用里）；
- dsh 作为**独立子模块（dsh-runtime）**随应用发布，并拥有自己的版本号与更新通道，可脱离 Electron 壳单独更新；
- Electron 壳只负责窗口、进程生命周期、托盘、更新，不 fork、不修改、不侵入 dsh 代码；
- dsh-studio 插件包继续保持 npm 发布线与 dsh 的插件机制，桌面端不是插件的替代形态。

## 2. 硬约束与已验证事实（dsh 0.1.0-rc.6 + Electron 43.4.0）

1. **dsh web 前端不能离线打包**：`index.html` 由运行中的 dsh 通过 index taps 注入
   `window.__DSH_BOOT__`（当前 profile 的 boot manifest）。把 dist 拷进应用用 `file://`
   打开无法启动。因此桌面壳必须加载 dsh 实时提供的 loopback HTTP 服务。
2. **dsh web 是纯 loopback 服务**：默认 `127.0.0.1:3080`；`--host 0.0.0.0` 被 dsh
   主动拒绝。壳只加载 `http://127.0.0.1:<port>`。
3. **`--port 0` 可用**：dsh 会在 loader 落定后打印就绪行
   `dsh web: http://127.0.0.1:<port>`。这行 stdout 是壳的就绪信号和真实端口来源。
4. **空 `~/.dsh` 可自举**：首次执行 `dsh web` 会自动初始化 `web` profile
   （`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`），无需用户预装任何东西。
5. **Electron 内置 Node 可运行 dsh，但需要 `--expose-internals`**：
   - Electron 43.4.0 内置 Node 24.18.1，满足 dsh 要求；
   - `ELECTRON_RUN_AS_NODE=1` 直接运行 dsh 会在 HMR 服务处失败，因为
     `node-addon-require-builtin` 在 Electron-as-Node 下不可用（缺少
     `GetAlignedPointerFromEmbedderData` symbol）；
   - 加上 `--expose-internals` 后完整跑通：`dsh web --port 0` 启动成功，
     `GET /` 返回 200 且页面包含 `__DSH_BOOT__`；
   - `node-pty` / `sharp` / `koffi` 原生依赖在该模式下均可加载。
6. **launcher flags 必须在 app flags 之前**：
   `dsh web --port 0 --patch x.yml` 会报 `unknown option '--patch'`；
   正确顺序是 `dsh web --patch x.yml --port 0`。
7. **单实例约束**：同一 profile 下 `dsh-studio-lan-auth` 网关固定监听 3443，
   第二个 dsh 实例会 EADDRINUSE。壳必须做单实例锁与“已有 dsh 实例复用”。
8. **dsh 本身没有 git worktree 功能**：CLI 只有 `profile` / `web` / `plugin` /
   `--dump-config`；`@deepseek-ai/dsh-workspace` 是 workspace 记录注册表，不是 git
   worktree；workflow 的 `isolation: 'worktree'` 明确 deferred；hooks 兼容层不支持
   `WorktreeCreate` / `WorktreeRemove`。未来的多 worktree 工作区能力需要我们自己
   封装 git 命令，不能依赖 dsh。

## 3. 架构决策

| 决策点 | 结论 |
|---|---|
| 壳技术 | Electron |
| dsh 形态 | 内置 `dsh-runtime` 独立子模块（自带 Node + `@deepseek-ai/dsh` 全依赖树） |
| 渲染方式 | BrowserWindow 加载 dsh 实时 loopback URL，不打 dist、不启 file:// |
| DSH_HOME | 默认 `~/.dsh`，与现有 CLI 共享 profile、插件、会话 |
| 端口 | spawn 使用 `dsh web --port 0`，解析 stdout 就绪 URL |
| 单实例 | 应用单实例锁；优先探测并复用已有健康 dsh 实例 |
| dsh 更新 | dsh-runtime 独立版本与发布物，用户数据目录原子切换，不随壳强制升级 |
| 壳更新 | electron-updater 等常规渠道，与 dsh-runtime 完全解耦 |

### 3.1 为什么 dsh-runtime 自带 Node，而不是用 Electron 内置 Node

`ELECTRON_RUN_AS_NODE` 已验证可用（见 §2.5），但它把 dsh 的 Node 版本锁死在
Electron 壳上：未来 dsh 要求更高 Node 时，单独更新 dsh-runtime 会失效，必须同时
升级整个壳，违背独立更新的目标。

因此目标态（方案 B）：

- dsh-runtime 内含官方 Node 二进制，版本写入 `runtime.json`；
- 启动命令固定为：
  `<runtime>/node/bin/node --expose-internals <runtime>/node_modules/@deepseek-ai/dsh/lib/bin.js web --port 0`
- dsh 需要新 Node 时，只需发布新的 dsh-runtime zip，壳无需改动。

MVP 阶段允许先用 Electron 内置 Node（方案 A）跑通壳与更新链路，但 spawn 逻辑必须
抽象为 `DshRuntime`，切换方案只换运行时路径，不改壳代码。

## 4. 仓库结构

```
dsh-studio/
├── packages/                    # dsh-studio 单包（npm 发布线）
├── apps/
│   ├── desktop/                 # Electron 壳（独立版本线）
│   │   ├── src/main/            # 运行时发现/启动、单实例锁、托盘、生命周期
│   │   │   ├── plugins.ts       # 首启自动装 dsh-studio 全家桶（自管实例）
│   │   │   ├── updater.ts       # dsh-runtime 更新链路
│   │   │   └── app-features.ts  # 托盘 / 开机自启 / 图标
│   │   ├── src/preload/         # 可选：contextBridge 注入 __DSH_DESKTOP__
│   │   ├── src/renderer/        # 启动页 / 错误页 / 日志页
│   │   ├── scripts/afterPack.cjs # electron-builder 钩子：注入出厂 runtime（绕开 node_modules 过滤）
│   │   └── electron-builder.yml
│   └── dsh-runtime/             # ✅ M1 已落地（2026-08-15）
│       ├── package.json         # pin "@deepseek-ai/dsh": "0.1.0-rc.6"（精确版本）
│       ├── scripts/build.mjs    # 从全局已验证 dsh 取材→裁剪→runtime.json→zip（zstd）
│       ├── scripts/smoke.mjs    # 冒烟：spawn web --port 0 → ready 行 → GET 200 + __DSH_BOOT__
│       └── test/                # build.test.mjs（node --test）
└── scripts/
    └── build-dsh-runtime.mjs    # 未来可把 build 上提到这里做多平台矩阵（当前在 apps/dsh-runtime/scripts）
```

## 5. dsh-runtime 子模块规范

### 5.1 目录内容

```
dsh-runtime/
├── runtime.json          # schemaVersion / dshVersion / nodeVersion / platform / arch / builtAt
├── node/
│   └── bin/node          # 官方 Node（当前目标：24.x LTS）
├── node_modules/
│   ├── @deepseek-ai/dsh/ # 含 lib/bin.js，全部 dependencies 已安装
│   └── ...               # node-pty / sharp / koffi 等平台原生 prebuild
└── VERSION               # 冗余文本版本，便于排障
```

### 5.2 构建与发布

- 在 `apps/dsh-runtime` 中 `npm ci --omit=dev`（每个目标平台各跑一次，平台矩阵在 CI）；
- 下载对应平台/架构的官方 Node 二进制到 `node/`；
- 裁剪非目标平台的 prebuild（例如 node-pty 包内约 62MB 的多平台 `.node`）；
- 写 `runtime.json`，打包为：
  `dsh-runtime-<dshVersion>-<platform>-<arch>.zip`
- 该 zip 是 dsh-runtime 的独立发布物，版本号跟随 `@deepseek-ai/dsh`，与桌面壳版本无关。

> **M1 实测的构建取材**（比文档初稿更省）：`scripts/build.mjs` 不重新 `npm ci`，而是从本机**已验证的全局安装**（`npm root -g` 下的 `@deepseek-ai/dsh`）复制其扁平依赖树（平台 prebuild 已在其中），并做了三项关键瘦身：
> 1. **删掉 `@deepseek-ai/dsh` 包内部那份完整的嵌套 node_modules**（npm 全局安装遗留的重复副本，约 333M）——runtime 由 608M 降到 ~220M，且 `web`/`--dump-config`/GET 均正常；
> 2. 只保留当前平台的原生 prebuild（node-pty / @img/sharp / @koromix/koffi / node-addon-require-builtin）；
> 3. 删除 `*.map` / `*.tsbuildinfo`。
>
> 结果：darwin-arm64 未压缩 220M → **zstd zip ~32MB**。
> 官方 Node 二进制下载未接线（需 nodejs.org 镜像/CI 预置产物），本地构建用 `--skip-node-download`，MVP 阶段直接用 Electron 内置 Node（方案 A）。

### 5.3 安装位置与覆盖规则

- 出厂版本：随安装包进入 `resources/dsh-runtime/`（只读、随壳签名）；
- 更新版本：进入用户数据目录 `<userData>/dsh-runtime/current/`；
- 启动选择：用户数据目录存在且校验通过 → 用它；否则回退出厂版本；
- 这样更新 dsh 不需要改写已签名 App 包，也不会破坏 macOS notarization。

## 6. 壳运行流程

```
应用启动
  → 单实例锁（已有壳实例则聚焦退出）
  → 读取 runtime.json，校验 dsh CLI：--version + web --dump-config
  → 探测 127.0.0.1:3080 是否已有健康 dsh 实例
      ├─ 有：复用（标记 external，壳退出时不杀）
      └─ 无：spawn 自己的 dsh 子进程（--port 0）
  → 等待 stdout 出现 "dsh web: http://127.0.0.1:<port>"（超时进错误页）
  → BrowserWindow.loadURL(该 URL)
  → 运行期：
      · will-navigate / setWindowOpenHandler 仅放行同 origin
      · nodeIntegration 关闭、contextIsolation 开启
      · dsh 日志写应用日志文件
  → 退出：SIGINT → 5s → SIGKILL（external 实例除外）
```

已知限制：已有 dsh 实例的探测先覆盖默认 3080；用户在其他端口常驻 dsh 时，本版本
暂不自动发现，需后续通过进程/端口扫描或手动配置补上。

### 6.1 出厂 runtime 打包（M3 实测）

- electron-builder 的 file-copy 会**过滤顶层 `node_modules`**（它假设那是 app 的依赖
  树），所以含 dsh 全依赖树的 runtime **不能用 `extraResources` 原样带入**——实测
  `extraResources` 只复制了 `VERSION`/`runtime.json`，`node_modules` 缺失，且若把
  `@dsh-studio/dsh-runtime` 作为 shell 的 `file:` 依���还会把这棵树误塞进 `app.asar`。
- 正确做法（已落地）：**把 dsh-runtime 从 shell 的 npm 依赖里移除**（主进程不 require
  它），改由 **`afterPack` 钩子**（`apps/desktop/scripts/afterPack.cjs`）在 pack 后整体
  `cpSync` `resources/dsh-runtime` → `<app>/Contents/Resources/dsh-runtime`。
- 产物验证：`app.asar` 仅 ~12KB（干净），`Resources/dsh-runtime` 220MB 完整 runtime；
  打包 `dist/mac-arm64/DSH Studio.app` 可离线自启 dsh（`process.resourcesPath` 分支找到
  出厂 runtime）→ ready URL → 退出无残留。

## 7. dsh-runtime 独立更新链路

```
更新 feed（版本 + 平台 + 架构 + url + sha512 + 最小壳版本）
  → 后台下载 zip
  → 校验 sha512
  → 解压到 <userData>/dsh-runtime/next/
  → 冒烟验证：node --expose-internals bin.js --version && web --dump-config
  → 停止当前 dsh 子进程
  → 原子切换 current ↔ previous
  → 重启 dsh 并等待就绪 URL
  → 失败：自动回滚 previous，错误页提示
```

### 7.1 M4 实现（src/main/updater.ts，2026-08-16 联调通过）

- **发布物格式 `tar.gz`**：M4 更新链路不再使用 M1 的 zstd-tar（扩展名 .zip），改用 gzip
  压缩的 tar。原因是壳内置 Node 无法解 zstd，而 gzip 用 Node 内置 `zlib` + `tar-stream`
  即可**纯 JS 解压，零外部二进制依赖**（Windows 无需系统 tar/zstd）。
- **feed 字段**：`schemaVersion / dshVersion / platform / arch / url / sha512 /
  minDesktopVersion / changelog / format('tar.gz')`。支持 `file:` URL 便于离线/测试。
- **流程**：`fetchFeed` → `downloadAndVerify`(边下边算 sha512) → `extractRuntime`(解压到
  next/) → `smokeRuntime`(node --version + web --dump-config) → `atomicSwitch`
  (current↔previous) → 重启 → `applyUpdate` 编排；启动失败自动 `rollback` 回滚 previous。
- **壳集成**：boot 成功后后台 `checkForUpdates()`（监听器写 desktop.log）；feed URL 默认
  占位 `https://update.dsh-studio.dev/desktop/feed.json`，可 `DSH_DESKTOP_FEED_URL` 覆盖。

原则：

- dsh-runtime 更新不强制用户重启壳（切换后重启 dsh 子进程即可）；
- 壳只要求 `runtime.json` 的 schemaVersion 兼容；
- dsh 与 Node 在同一个运行时发布物里一起更新，避免版本错配。

## 8. 与 dsh-studio 插件的关系

- 桌面壳默认使用 `~/.dsh`，因此用户已装的 dsh-studio、状态文件、lan-auth 网关
  配置全部自然可见；
- dsh-studio 插件继续走 `dsh plugin add` / npm 发布，桌面端不重新实现插件安装；
- **首启自动装全家桶（已实现）**：`src/main/plugins.ts`（FamilyPlugins）在**自管 dsh 实例**就绪后，后台检测 web profile 的 dependencies 是否含 `dsh-studio`；未装则执行 `dsh plugin --profile web add -w dsh-studio`，失败仅记录日志、不阻塞启动。**复用外部 3080 实例时不干预**用户已有配置。
- 后续可在壳里做更完整的“插件管理”页：自己封装 `dsh plugin --profile web ...`，并考虑把 pnpm 纳入 dsh-runtime（当前自动装依赖系统 pnpm 在 PATH）。

### 8.1 M5 实现（托盘 / 开机自启 / 错误页 / 窗口图标，2026-08-16）

- **图标**：logo 取自 dsh web `/favicon.svg`（爪印）→ 光栅化 `build/icon.png`（1024），
  系统 `iconutil` 生成本地 `build/icon.icns`（避免 electron-builder 联网下转换工具）。
  `build/tray-16.png` / `tray-32.png` 用于菜单栏托盘。
- **托盘**：`src/main/app-features.ts#createTray`——菜单栏爪印图标（macOS template image），
  菜单：显示窗口 / 检查更新 / 退出；有托盘时关闭窗口驻留后台（`app.isQuiting` 显式退出）。
- **开机自启**：`applyAutostart()`（`app.setLoginItemSettings`），默认开，
  `DSH_DESKTOP_NO_AUTOSTART=1` 可关（测试/开发）。
- **错误页**：dsh 启动失败时不弹系统框直接退出，而是 `loadFile(out/renderer/index.html,
  { query: { error } })` 展示带爪印 logo 的错误页 + 重试按钮，进程驻留便于看日志。
  boot 成功前 renderer 兜底为“正在启动”状态页。
- **窗口图标**：`BrowserWindow({ icon, title: v${version} })`，打包后
  `process.resourcesPath/icon.png` 由 afterPack 注入。

## 9. 阶段计划

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| M1 | `apps/dsh-runtime` 骨架 + pin dsh 版本 + 当前平台 runtime 构建脚本 | ✅ 本机产出可运行 runtime（`out/dsh-runtime-0.1.0-rc.6-darwin-arm64.zip`，zstd ~32MB）+ runtime.json，冒烟通过 |
| M2 | `apps/desktop` 最小 Electron 壳（spawn / 就绪 URL / WebView / 退出清理） | ✅ self-spawn → ready URL → 窗口加载；退出后子进程无残留（2026-08-15 实测） |
| M3 | electron-builder 打包 extraResources + 出厂 runtime | ✅ `dist/mac-arm64/dsh-studio Desktop.app` 可构建，产物离线自启 dsh 通过（2026-08-15 实测）；三平台目录包 target 已配 |
| M4 | dsh-runtime 更新 feed + 原子切换 + 回滚 | ✅ `src/main/updater.ts` 全链路（feed→下载+sha512→纯 JS 解压→冒烟→原子切换→重启→回滚）Node E2E 实测通过（2026-08-16）；发布物 tar.gz 无外部二进制依赖 |
| M5 | 签名/公证、托盘、开机自启、错误页打磨 | ✅ 托盘/开机自启/错误页/窗口图标已实现并验证（2026-08-16，见 §8.1）；签名/公证待 Apple Developer ID 证书 |
| 开箱即用 | 首启自动装 dsh-studio | ✅ `src/main/plugins.ts` 自管实例就绪后自动 `dsh plugin --profile web add -w dsh-studio`（2026-08-19，见 §8） |
| 后续 | 多 worktree 工作区管理（自研，dsh 不提供） | 单独设计 |

## 10. 不侵入 dsh 的边界

- 不修改 `@deepseek-ai/*` 源码或构建产物；
- 不复制 dsh 前端 dist，不用 `file://` 打开；
- 不写用户的 `cordis.patch.yml`，不改 dsh profile 结构；
- 与 dsh 只通过 CLI（spawn）和 loopback HTTP（WebView）交互；
- dsh-runtime 与壳之间只有 `runtime.json` + spawn 契约 + stdout 就绪行。
