# 交接文档（HANDOFF）

> 更新日期：2026-08-16
> 项目：DSH Studio（`dsh-studio`）—— DSH 傻瓜式插件全家桶（单包）

> **当前状态（2026-08-19）**：全家桶 v0.2.1 已在 main，单包化重构完成。1 个 npm 包 `dsh-studio`（聚合 + 六个功能子模块，见 `docs/DSH_STUDIO_MIGRATION.md`）。
> 旧 7 个 `dsh-studio*` 包移至 `packages/_legacy/` 备份（不参与 workspace、不再发布）。

## 1. 项目目标

做一个「傻瓜式」的 DSH 插件聚合包：**装一个包，所有功能开箱即用**。
相当于插件管理器 + 全部插件打包在一起，开箱即用、尽量减少用户配置。
双产品线：npm 插件包 + 桌面客户端，共用同一套全家桶逻辑。

## 2. 当前状态

- 架构方案已定稿并全部实现：见 `docs/ARCHITECTURE.md`（含双 watch 热重载 / 多 profile / 热开关）
- **1 个 npm 包（v0.2.1）**：
  - `packages/dsh-studio/` 单包（方案B：host 单入口）。`dshStudio.store` service + CLI `list/enable/disable/install` + **cordis.patch.yml 只 insert 1 行 dsh-studio** + 六个功能子模块（notifier/scheduler/lan-auth/input-history/webui/worktree）+ 设置页「功能商店」「归档会话」「主题商店」
  - host `apply()` 按 `~/.dsh/dsh-studio/state.json` 逐功能挂载；单一 client bundle 按同一份 state 门控各功能 UI
- **内置能力（无独立包）**：满血模式 preset（`src/preset.ts` + `packages/dsh-studio/preset/`）、GitHub 生态目录（`src/ecosystem.ts` + `ecosystem-fallback.json`）、归档会话管理（`src/archive.ts`）
- **插件管理机制已验证**：host 单入口�� state 挂载；双向开关 + 重启保留通过；client 侧按同一 state 门控 UI
- **桌面客户端（main）**：`apps/desktop` + `apps/dsh-runtime`，M1–M5 全部落地并真机验证，**首启自动装 dsh-studio**（详见 `docs/DESKTOP.md`）
- **CI**：`ci.yml`（build/typecheck/test）+ `release.yml`（手动发布，默认 dry-run）
- **测试现状**：`dsh-studio` 已配置 `tsx --test`（webui/worktree/lan-auth 测试已迁入）；CI 门禁会自动纳入
- 验证通过：`pnpm typecheck`/`build` 全绿；6 包 link 进 dev profile；`--dump-config` 无重复 id；发布版 registry 解析全家桶
- GitHub：https://github.com/jlu-lujing/dsh-kit（jlu-lujing）；本地 `~/workspace/dsh-kit`

## 3. 环境

| 项 | 值 |
|---|---|
| Node | v24.16.0（nvm） |
| pnpm（本地）| 8.15.4（系统级） |
| pnpm（CI）| 9（`pnpm/action-setup`） |
| dsh | 全局 `@deepseek-ai/dsh` 0.1.0-rc.6 |
| profile | `~/.dsh/profiles/web` |
| git | ssh（jlu-lujing 已认证） |

注意：
- 构建 dsh 插件用 `npx pnpm@9`（pnpm 8 有 rolldown binding bug）
- profile 目录有 pnpm-workspace，`dsh plugin` 加依赖需 `-w`
- `@deepseek-ai/dsh-tools` 锁 `next` tag（0.1.0-rc.6），npm latest 是过期的 `0.0.1-rc.1`

## 4. 插件开发工作流

```
1. pnpm dev                      # 常驻双 watch（client 热更 + host tsc watch）
2. 改 client → 浏览器自动热更（lib/client.js）
3. 改 host → lib/ 自动重编译 → 重启 dsh web
4. pnpm typecheck && pnpm build  # 推送前本地门禁
5. 冒烟：dsh --profile dev --port <p> 或 dsh web --dump-config
```

- 插件结构：`package.json` 里 `dsh.bundle.patch` 指向 `cordis.patch.yml`；`src/index.ts` 导出 `name`/`inject`/`apply`；有 client 的包在 `package.json` 声明 `dsh.client.platform = web` 并由 tsdown 产出 `lib/client.js`
- 新插件用官方脚手架 `npx create-dsh-plugin <name> -t tool` 生成，再移入 `packages/`

## 5. 全家桶功能清单（v0.2.1）

| 插件/能力 | 功能 | 说明 |
|---|---|---|
| `dsh-studio` | 单包聚合 | 管理 CLI + 功能商店 + 内置 preset/生态/归档 + 六个功能子模块；cordis.patch 只 insert 1 行 |
| 局域网鉴权 | 内置子模块 | HTTPS 反向代理 + token/登录 + 登出确认；默认关闭 |
| 桌面通知 | 内置子模块 | 监听回合结束，跨平台通知 |
| 定时任务 | 内置子模块 | cron 持久化 + 管理路由 |
| 输入历史 | 内置子模块 | 当前会话 ↑/↓ 回填（纯 client） |
| 满血模式 preset（内置） | 二阶段 agent preset | 内置导入/删除管理器 |
| J-Space 认知协议 skill（内置） | 推理/长任务协议 | 随满血模式安装到 `~/.dsh/skills/j-space`；满血 persona 轻量引导按需 `skill_load j-space` |
| GitHub 生态目录（内置） | `topic:dsh-plugin` 仓库展示 | 只读展示，不提供一键安装 |
| 归档会话管理（内置） | 归档恢复 / 彻底删除 | 补官方缺失的恢复/删除 API，落盘 workspace.json |
| 桌面客户端（apps） | Electron 壳 + dsh-runtime | 开箱即用、自动装全家桶、托盘/自启/更新 |

## 6. 踩坑记录（重要）

1. **dsh-web-ui 插件在 rc.6 上有 DOM 选择器问题**：实际 DOM 是 `[data-slot="sidebar"]` / `[data-slot="conversation"]`，frame 是 `[data-slot="root"] > :first-child`；需改源码重建（该仓库已删除，不再维护）。
2. **loopback-only 限制**：dsh web 特权 API（settings/credentials 等）只允许 127.0.0.1；通过网关做反向代理是**改边界而非改 dsh 源码**。
3. **crypto.randomUUID**：非安全上下文（局域网 IP）浏览器没有 `crypto.randomUUID`，需 polyfill。
4. **SSH 插件 fence**：dsh-ssh 的 `isLoopbackRequest` 只认 loopback；曾放宽为接受私有网段。
5. **dsh-ssh 导入 bug**：无 IdentityFile 的主机被误判为 password 认证；改为默认 key 认证。
6. **环境变量**：DEEPSEEK_API_KEY / OPENCODE_API_KEY（opencode.ai 网关，模型 deepseek-v4-pro）。
7. **改过 dsh 全局包源码的历史补丁**：`dsh-client-connection`（放开特权）、`dsh-web-frontend`（randomUUID polyfill）——升级 dsh 后需复查；**lan-auth 网关方案落地后已不再依赖放开特权源码**。
8. **聚合包 + 子包重复 id 冲突（实测）**：cordis loader 拒绝同一次 update 内重复 loader entry id（`vendor/loader/src/config/group.ts:64`）。**结构**：聚合包一次 insert 全部 6 行，5 个功能包全部去 bundle（纯库）——从根上消除重复 id。
9. **pnpm `link:` / `file:` 不传递依赖（本地开发关键）**：`link:` 协议跳过 dependencies 解析。单包化后**本地源码调试只需 link 一个 `dsh-studio` 包**；发布版（registry）`add dsh-studio` 同一条命令。
10. **cordis host 插件 apply**：`config: Config = {}` 需默认值；`ctx.set('x.y', v)` 前必须先 `ctx.provide('x.y')`。
11. **`!!js` 表达式求值环境**：`with (ctx) { eval(expr) }`，可用 `process` / `process.env` / `ctx` / 根 ctx service（`dshHomePath`）；**不可用** `require`；同步读文件用 `process.getBuiltinModule('fs')`（Node 22.3+）。
12. **单入口时序**：host apply 先建 store 再逐功能挂载，feature 子模块可依赖 `webServer` 等服务；client 侧首拉 store 状态再注册功能 UI。
13. **YAML `!!js` 引号**：含 `:` 的复杂表达式必须整体双引号包裹（`!!js "(...)"`），否则 YAML 误解析为 mapping。
14. **loader 动态开关（备选，非首选）**：`ctx.loader.entries()` + `entry.update({disabled}, false, true)` 可停已加载 fiber，但 init 已发生一次；表达式方案更干净。
15. **验证插件加载**：`dsh --profile dev --port <p>`（不是 `dsh web`——那是 web profile 别名）。插件 apply 里写临时文件验证是否加载。
16. **lan-auth 路径重复拼接（已修复）**：`$DSH_HOME` 已是 `~/.dsh`，旧代码二次拼接 `.dsh` 导致 token 落错目录；统一为 `store.ts` 的 `lanAuthRoot()`。
17. **网关转发必须剥浏览器标记头（已修复）**：DSH `/api` 有同源信任栅栏，网关原样透传 `Origin` 导致 403；修复：LAN 转发时删除 origin/sec-fetch-*/referer，只留 `x-dsh-studio-lan-auth-proxy` 标记 + 重写 Host。**网关就是认证边界**。
18. **网关 WebSocket 升级不能用 httpRequest 转发（已修复）**：DSH `WebUpgradeRoute` 把原始 socket + head 字节交给 `ws.handleUpgrade`；改为原生 TCP 隧道（重写请求行 + 剥标记头 + 写回头字节 + 双向 pipe）。
19. **统一使用 browse 选择器而非 native（已修复，已插件化）**：`directory-picker-auto` 启动时凭 loopback 在 win32/darwin 解析为 native；Windows 下原生 worker 可能崩溃（`win32 folder dialog worker exited before reporting a result`），且 native 对远程浏览器不可见。当前 dsh-studio patch **始终禁用** `directory-picker`（auto），由 dsh-studio host `apply()` 统一动态注入 browse pair——**零 profile 配置**，本机与远程都用 web 选择器。
20. **client bundle 不会随 `pnpm build` 自动生成**：`dsh-studio` 需 tsdown 产出 `lib/client.js`。`pnpm build:client`（或 `pnpm dev`）负责产出；换机器/重新 clone 后 build 与 build:client 都跑一遍。
21. **动态 loader 注入的插件必须是 profile 已解析的依赖**：`ctx.loader.create({ name })` 只能装 profile node_modules 里可解析的包。browse pair 是官方包，所以 dsh-studio 动态注入可用；`ctx.loader` 类型来自 `@deepseek-ai/cordis-plugin-loader`（devDep）。
22. **JSDoc 注释里的 `*/` 会提前闭合块注释（踩坑）**：注释里写 `cron 表达式 '*/s'` 会被 TS 当注释终止符。规避：转义或改写措辞。**顺带**：scheduler 任务命令一开始用 `execFile`（无 shell），用户期望 shell → 已改 `exec`（`/bin/sh -c`），支持管道/变量。
23. **`pnpm dev` 双 watch 的 glob 与轮询（2026-08-16）**：`dev-web.ts` glob 用 `packages/dsh-studio*`；host watch 用 `tsc -b --watch`。**tsdown 0.11.13 / rolldown 1.0 beta 已拒绝官方脚本的 `inputOptions.watch.watcher` 形状** → 移除了 `--poll`，用原生 fs watch；`ignoreWatch` 里 chokidar v4 字符串按**精确路径**匹配，所以忽略 host 源文件要用 `pkgDir` 绝对路径列表（不能写 glob）。
24. **归档会话的权威在内存（2026-08-16）**：直接读写 `~/.dsh/storages/workspace.json`，但 dsh 运行期内存态为权威，操作后需**重启 dsh** 才被注册表重新读取。删除会真删磁盘日志（不可恢复，UI 二次确认）。
25. **满血模式 preset 不再走 loader 行（2026-08-16）**：预设文件内置在 `packages/dsh-studio/preset/`，由 `src/preset.ts` 导入/删除（幂等、非破坏、staging+rename）；功能商店里它是 `installable` + `togglable:false`（只安装/删除，不显示启停按钮）。

## 7. 完成记录与待办

### 已完成（v0.2.1）

- 插件管理机制（CLI + 状态文件 + 动态 disabled 表达式）——已验证
- 局域网鉴权网���（HTTPS 反向代理 + 私有 CA + token/用户 webui + 登出二次确认 + 默认关闭）——已验证
- 远程可用性（剥标记头 / WS 原生隧道 / dsh-studio 统一 browse 选择器注入）——已验证
- 桌面通知——已验证
- 定时任务——已验证
- 输入历史（↑/↓ 回填）——已验证
- **满血模式内化**：剥离独立的 `dsh-anchored-standard` npm 包，改为 dsh-studio 内置 preset 导入/删除管理器，功能商店提供导入/删除
- **GitHub 生态目录**：分片抓取 + 30 分钟缓存 + fallback 快照 + `GITHUB_TOKEN` 提限流——已完成
- **归档会话管理**：恢复 / 彻底删除（含日志文件），设置页面板，二次确认——已完成
- **桌面客户端（M1–M5）**：dsh-runtime + Electron 壳 + 打包注入 + 更新链路 + 托盘/自启/错误页/图标；**首启自动装 dsh-studio**——已真机验证
- **CI / 发布**：`ci.yml` + `release.yml`（默认 dry-run，发布前校验 6 包版本一致）
- **发布执行**：npm registry 已发布 v0.2.1（`dsh-studio` 单包）

### 待办

- [ ] Apple Developer ID 签名/公证（当前 pack 走本地 identity 跳过签名）
- [ ] dsh-runtime 官方 Node 二进制下载接线（nodejs.org 镜像 / CI 预置产物；当前 MVP 用 Electron 内置 Node 方案 A）
- [ ] 实际更新 feed 域名配置（`update.dsh-studio.dev` 占位；本地/测试用 `DSH_DESKTOP_FEED_URL`）
- [x] `dsh-studio` 补充 `test` 脚本（webui/worktree/lan-auth 测试，`pnpm test` 已实际执行）
- [ ] `apps/desktop` 里的 `src/main/plugins.ts` 自动装全家桶在**复用外部 3080** 时不干预（符合预期），后续可加手动「重装全家桶」入口
- [ ] 多 worktree 工作区管理（dsh 不提供，需自研 git 封装）——单独设计

## 8. 常用命令

```sh
# 本机访问 dsh web
dsh web --port 3080

# 开发（双 watch）
pnpm dev                      # client 热更 + host tsc watch（重启 dsh 生效）
pnpm build && pnpm build:client

# 插件管理
dsh plugin --profile web add -w <path|pkg>
dsh plugin --profile web remove <name>

# DSH Studio 全家桶安装（发布后 = 装 dsh-studio 即全家桶）
dsh plugin --profile <p> add -w dsh-studio

# 本地源码（link: 不解析依赖：6 包一起 link）
dsh plugin --profile <p> add -w \
  <dsh-studio> <dsh-studio-notifier> <dsh-studio-scheduler> <dsh-studio-lan-auth> <dsh-studio-input-history> \
  <dsh-studio-webui>

# dsh-studio CLI（读写 ~/.dsh/dsh-studio/state.json）
dsh-studio list | status | ls
dsh-studio enable <feature>
dsh-studio disable <feature>
dsh-studio install [--profile <p>]    # 一键装全家桶（发布后）

# 发布（CI 优先；本地备选）
pnpm -r build && pnpm -r typecheck && pnpm -r test
pnpm -r publish --access public --no-git-checks --dry-run
pnpm -r publish --access public --no-git-checks

# 远程访问（启用 dsh-studio-lan-auth 后）
#   局域网设备 -> https://<主机IP>:3443  + token/登录
#   管理路由（仅本机）: GET /dsh-studio-lan-auth/status | POST .../tokens
# 证书管理 CLI（本机）: dsh-studio-lan-auth init-ca [--ip ...] | dsh-studio-lan-auth status

# 归档会话
#   GET /dsh-studio/archive/sessions
#   POST /dsh-studio/archive/{id}/restore | /delete   （操作后重启 dsh 生效）
```
