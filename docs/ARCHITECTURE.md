# DSH Studio 架构设计

> 更新日期：2026-08-16
> 状态：v0.2.1 已全部实现并验证（单包化重构 2026-08-19）

## 1. 定位

DSH Studio（`dsh-studio`）是一个 DSH「傻瓜式插件全家桶」单包：

- **装一个包，所有功能开箱即用**：`dsh plugin add dsh-studio` 一次带进全部；
- **每个功能可独立开关**：功能是包内子模块，host 单入口按状态文件（CLI / 设置面板）决定是否挂载；客户端 UI 也跟随同一份状态门控；重启保留；
- **内置能力**：满血模式 preset、GitHub 生态目录、归档会话管理等随 dsh-studio 打包；
- **双产品线**：npm 插件包 + 桌面客户端（Electron + 内置 dsh-runtime，共用同一套全家桶逻辑）。

## 2. 核心机制（来自 dsh 源码调研）

### 2.1 插件 = bundle 层

- 一个 npm 包声明 `dsh.bundle.patch` → `cordis.patch.yml` 即成为一个 bundle 插件；
- `dsh plugin add` 时 reconcile 进 profile 的 `dsh.profile.bundles` 层栈（`apps/cli/src/plugin.ts`）；
- 加载时按层栈顺序 apply patch：每层按行 `id` 覆盖/插入，**后写的层赢**；
- **聚合是原生能力**：`@deepseek-ai/dsh-base` 就是依赖 20+ 子包 + patch insert 它们行的 bundle。

### 2.2 开关 = `disabled` 行属性

- loader 启动时跳过 `entry.disabled` 的行（`packages/boot/app-boot/src/index.ts:659`）；
- 用户 profile 的 `cordis.patch.yml` 是最后一层，可对任意行写 `disabled: true`。

### 2.3 webui 面板 = client 端 Cordis 插件

- client 端插件通过 `ctx.slots` 注入 UI；
- **我们使用的 slot**：
  - `settings.section`：功能商店、归档会话、局域网鉴权；
  - `sidebar.footer.action`：远程会话登出按钮；
  - `conversation.composer.dock`：输入历史提示条。

### 2.4 动态装载 = `dynamicCordisRunner`（注意边界）

- `@deepseek-ai/dsh-cordis-host-runner` + `@deepseek-ai/dsh-tool-cordis` 提供运行时 define/run/stop/undefine；
- **模型驱动**：session 作用域、vm 沙箱、需审批、纯进程内存、不持久化；
- 结论：**不适合做用户傻瓜包的开关机制**（商店用的是持久化状态文件 + 管理路由，见 §5）。

## 3. 架构决策

| 决策点 | 结论 |
|---|---|
| 傻瓜包本体 | 单一聚合包 `dsh-studio`（方案B：host 单入口）+ 管理入口（设置页「功能商店」） |
| 功能粒度 | 包内功能子模块（notifier/scheduler/lan-auth/input-history/webui/worktree），host apply 按 state 独立挂载 |
| 内置能力粒度 | preset / 生态目录 / 归档 等随 dsh-studio 内置 |
| 商店形态 | webui 设置面板（`settings.section` slot） |
| 用户开关机制 | 持久化状态文件，host 单入口与 client 门控同一份 state（**不用** dynamicCordisRunner 做启停） |
| 面板 UI 投递 | 直接 client 插件 + 管理路由（未用动态 runner 的投递机制） |
| 持久化位置 | dsh-studio 自管理状态文件（`~/.dsh/dsh-studio/state.json`，不碰用户 cordis.patch.yml） |
| 桌面端 | Electron 壳 + 内置 dsh-runtime 独立子模块（见 `docs/DESKTOP.md`） |

## 4. 仓库结构

```
dsh-kit/                                    # 仓库目录名（保留历史）
├── packages/
│   ├── dsh-studio/                  # 单包（聚合 + 六个功能子模块）
│   │   ├── package.json             #   name: dsh-studio, bin: dsh-studio, exports 含 ./client 与各功能子路径
│   │   ├── cordis.patch.yml         #   只 insert 1 行 dsh-studio（host 单入口），disable 官方两个多余行
│   │   ├── bin/dsh-studio.mjs       #   CLI：list / enable / disable / install
│   │   ├── preset/                  #   内置满血模式 preset（agent.cordis.yml + 各 .mjs + preset.yml + j-space）
│   │   ├── ecosystem-fallback.json  #   GitHub 生态目录内置快照
│   │   ├── tsdown.config.ts         #   client bundle（src/client/index.ts → lib/client.js）
│   │   └── src/
│   │       ├── index.ts             #   host 单入口：store 服务 + 管理路由 + 按 state 挂载六功能
│   │       ├── store.ts / state.ts  #   功能元数据 + 状态文件读写（~/.dsh/dsh-studio/state.json）
│   │       ├── preset.ts / ecosystem.ts / archive.ts
│   │       ├── client/index.ts      #   统一 client 入口：聚合面板 + 按 state 门控功能 UI
│   │       ├── notifier/  scheduler/  lan-auth/  input-history/  webui/  worktree/
│   │       └── <feature>/client/    #   各功能 client 半边（webui/worktree/lan-auth/input-history）
│   └── _legacy/                     #   旧 7 个 dsh-studio* 包备份（不参与 workspace、不再发布）
├── apps/
│   ├── dsh-runtime/                 # 内置 dsh 独立运行时子模块（详见 docs/DESKTOP.md）
│   └── desktop/                     # Electron 壳（托盘/自启/更新/错误页 + 首启自动装 dsh-studio）
├── scripts/
│   ├── dev.ts                       # 统一 dev 编排：client watch + host tsc watch
│   ├── dev-web.ts                   # client bundle watch（tsdown，glob packages/dsh-studio*）
│   ├── dev-host-watch.ts            # host `tsc -b --watch`（单包）
│   └── build-client-once.mjs        # 一次性产出 dsh-studio 的 lib/client.js
├── .github/workflows/               # ci.yml（build/typecheck/test）+ release.yml（npm 发布）
└── docs/
    ├── ARCHITECTURE.md              # 本文档
    ├── HANDOFF.md                   # 交接文档
    └── DESKTOP.md                   # 桌面客户端设计
```

## 5. 关键流程

### 5.1 安装

```sh
# 发布后：装 dsh-studio 一个包 = 全家桶
dsh plugin --profile web add -w dsh-studio

# 本地源码（单包 link）
dsh plugin --profile dev add -w ~/workspace/dsh-studio/packages/dsh-studio
```

- 发布版 `pnpm add dsh-studio` 即装好整个包；其 cordis.patch.yml 只 insert 一条 `dsh-studio` 行（host 单入口）。
- 满血模式 preset / 生态目录 / 归档由 dsh-studio 内置分发，无需额外包。
- dsh-studio apply：读取默认状态，注册 `dshStudio.store` 服务；若「满血模式」启用且未导入，自动把内置 preset 导入到 `~/.dsh/.agent-presets/boost-mode`。

### 5.2 行的唯一归属（host 单入口）

**核心变化（方案B）**：不再用「聚合 patch 每功能一行」的方式挂载——那样每个功能行都要 import 同一个 `dsh-studio` 包，cordis 会把同一插件 apply 多次（错误）。改为 **cordis.patch.yml 只 insert 1 行 `dsh-studio`**，这个 host 插件在 `apply()` 里按 `~/.dsh/dsh-studio/state.json` 的 per-feature on/off 决定调用哪个功能子模块的 `apply()`。

- ✅ **单入口 patch**：只有 `dsh-studio` 一行；六个功能都不是独立 loader 行。
- ✅ **独立启停仍保留**：`dsh-studio enable/disable <feature>` 与功能商店写同一份 state；host 侧停用 = 不挂载（路由/定时器/网关/通知不运行）。
- ✅ **client 侧门控**：单一 `.client` bundle 里按同一份 state 决定各功能 UI 是否注册（首拉 + 5s 轮询 diff，启停变化即重建注册，无需整页刷新）。
- 官方 `directory-picker` 与 `session-log-download` 两行被全局禁用；browse 选择器由 host apply 挂载。

> 代价（已接受）：单一 npm 包不能按功能分别 `add/remove`；想移除某个功能用 `dsh-studio disable <feature>`（host 不再挂载，client UI 也随之隐藏），保留物理安装（方便随时恢复）。

### 5.3 用户开关（CLI / 面板 → 状态文件）

```
用户: dsh-studio disable dsh-studio-notifier    # 或面板点"停用"
  → CLI/面板调 store.setEnabled('dsh-studio-notifier', false)
  → 写状态文件 ~/.dsh/dsh-studio/state.json { "features": { "dsh-studio-notifier": false } }
  → 下次 dsh 启动时 host apply 不挂载 notifier；client 侧也不注册其 UI
```

### 功能级 client 门控

- client 入口首拉 `GET /dsh-studio/store` 得到全部 `{ id, enabled }`；
- 只用已启用功能的 `apply()` 去注册其 `settings.section` / 槽位 / 服务；
- 之后每 5s 轮询一次该端点，diff 变化就重建注册：停用 → 卸载对应 UI；启用 → 挂上对应 UI（无需整页刷新）。

### 5.4 生效机制：host 单入口按 state 挂载（已验证）

每个功能不再有独立 loader 行，`dsh-studio` 的 host `apply()` 依次检查 `store.isEnabled('dsh-studio-xxx')`，为 true 才调用对应子模块的 `apply(ctx)`：

```ts
if (store.isEnabled('dsh-studio-notifier')) applyNotifier(ctx)
if (store.isEnabled('dsh-studio-lan-auth')) applyLanAuth(ctx)   // 默认关，需显式开
if (store.isEnabled('dsh-studio-worktree')) applyWorktree(ctx)
if (store.isEnabled('dsh-studio-webui'))    applyWebui(ctx)
if (store.isEnabled('dsh-studio-scheduler')) applyScheduler(ctx)
// input-history 是纯 client surface，host 侧无需挂载
```

- **状态默认**：除 lan-auth（默认关）外均默认开；状态文件缺失/损坏 → 按默认。
- **重启后状态保留**：启动时读 `~/.dsh/dsh-studio/state.json`，停用的功能不挂载。
- 功能子模块仍然是各自独立的 cordis 插件定义（`name`/`inject`/`apply` 齐全），只是不再单独出现在 loader 行里；由聚合入口在运行时组合。

### 5.5 关键机制发现（实测）

1. **`!!js` 求值环境**：`with (ctx) { eval(expr) }`，可访问 `process`、`process.env`、`ctx` 及根 ctx 提供的 service（如 `dshHomePath`）。`require` **不可用**（Eval 无 CJS），`fs` 需经 `process.getBuiltinModule`。
2. **时序坑**：patch `disabled` 首次求值在 dsh-studio 插件 apply **之前**（loader 并行加载），表达式**不能依赖** `dshKit.featureState` service。解法：表达式自给自足直接读文件。
3. **YAML 引号**：含 `:` 的复杂表达式必须整体用双引号包裹，否则 YAML 误解析为 mapping。
4. **loader 动态开关（备选）**：`ctx.loader.entries()` + `entry.update({disabled}, false, true)` 可运行时禁用已加载 entry，但 init 已发生一次，不如表达式方案干净。

## 6. 内置能力与路由（dsh-studio 聚合包）

dsh-studio 的 host（`src/index.ts`）除了提供 store 服务，还注册了以下管理路由（loopback DSH webServer，网关后视为本机信任面；各功能路由由对应子模块挂在启用时）：

| 能力 | 路由 | 说明 |
|---|---|---|
| 功能商店 | `GET /dsh-studio/store` · `POST /dsh-studio/store/{id}` · `POST /dsh-studio/store/install` | 清单/状态、启停、一键安装全家桶 |
| 满血模式 preset | `POST /dsh-studio/store/dsh-boost-mode/install` · `.../delete` | 导入/删除 preset（幂等、删除即禁用） |
| GitHub 生态目录 | `GET /dsh-studio/store/ecosystem[?refresh=1]` | 只读展示 `topic:dsh-plugin` 仓库 |
| 归档会话 | `GET /dsh-studio/archive/sessions` · `POST /dsh-studio/archive/{id}/restore` · `.../delete` | 恢复 / 彻底删除归档会话 |
| 定时任务 | `GET/POST /dsh-studio-scheduler/tasks` · `PATCH/DELETE .../tasks/{id}` | scheduler 子模块自持（启用时） |
| 局域网鉴权 | `/dsh-studio-lan-auth/*` | lan-auth 子模块自持（启用时），管理面仅本机 |

### 6.1 功能商店面板（client）

- slot：`settings.section`（id `dsh-studio-store`，priority 40）；
- 展示每个功能的名称/描述/状态；可启停（`togglable`）功能有「启用/停用」按钮；
- 「满血模式」是 `installable` 但 `togglable: false`——只提供「安装/删除」，不提供启停按钮（启停由安装状态直接决定）；
- 底部「一键安装全」= `POST /dsh-studio/store/install` → 执行 `dsh plugin --profile <p> add -w dsh-studio`。

### 6.2 满血模式（TurboBoost Mode）preset（内置）

- **形态**：DSH **agent preset**（`~/.dsh/.agent-presets/boost-mode`），不是 Cordis bundle；
- **来源**：算法与文件集合随 dsh-studio 内置打包分发；
- **接入**：preset 文件内置在 `packages/dsh-studio/preset/`，`src/preset.ts` 负责导入/删除（幂等、非破坏；目标已存在不覆盖；staging + rename 原子落位）；
- **开关**：store 清单里的功能 id 为 `dsh-boost-mode`，默认开启；启用即自动导入，删除即禁用；
- **名称**：DSH 预设选择器里显示 `TurboBoost Mode`（`preset.yml` 的 `name` 字段；中文语境为「满血模式」）。
- **J-Space 认知协议 skill**：随 preset 一起内置（`packages/dsh-studio/preset/j-space/`）。安装 preset 时自动装入 `~/.dsh/skills/j-space/`（可被 `skill_search`/`skill_load` 发现）；满血 persona 轻量引导模型在深度推理/长任务/工具重任务/验证恢复时用 `skill_load j-space` 按需加载。遵循 J-Space 官方「选择性加载」，不注入每轮上下文。

### 6.3 GitHub 生态目录

- `src/ecosystem.ts` 从 GitHub Search API 拉取 `topic:dsh-plugin`（按 star 分片，避免单查询 1000 条上限）；
- 首次秒出 Top 100，后台补全；磁盘缓存 30 分钟（`~/.dsh/dsh-studio/ecosystem-cache.json`）；
- 未认证限流 10 次/分钟，配置 `GITHUB_TOKEN` 提升到 30 次/分钟；
- 网络失败 / 无缓存回退到 `ecosystem-fallback.json` 快照；
- 只读展示，不提供一键安装（各仓库安装方式不同）。思路参考 [0xKcyzz/dsh-plugin-store](https://github.com/0xKcyzz/dsh-plugin-store)（MIT）。

### 6.4 归档会话管理

- DSH 官方「归档」只把会话从视图隐藏、保留日志；没有恢复/删除 API；
- `src/archive.ts` 补齐：恢复（从 `archivedSessionIds` 移除回到原分组）；删除（从归档集 + 所有 workspace 的 `sessionIds` 摘除 + 删磁盘日志目录，不可恢复）；
- 落盘 `~/.dsh/storages/workspace.json`；dsh 运行期以内存态为准，**操作后需重启 dsh 生效**；
- 设置页「归档会话」面板（`settings.section`，id `dsh-studio-archive`，priority 41），删除有二次确认。

## 7. 开发架构（热重载 / 多 profile / 热开关）

### 7.1 热重载能力边界

| 层 | 改动内容 | 是否需要重启 |
|---|---|---|
| **patch 层** | `cordis.patch.yml`（插件启停/配置） | ❌ 即时生效（HMR `watchUserPatches`） |
| **client 插件**（webui/面板） | `lib/client.js` 构建产物 | ❌ 自动热更新（SSE `rebuilt` 帧） |
| **host 插件**（服务端逻辑） | `lib/index.js` 模块 | ✅ 需重启（web bundle 禁模块级 HMR；`pnpm dev` 会先自动重编译） |

### 7.2 双 watch（`pnpm dev`）

```
pnpm dev（scripts/dev.ts 编排）        dsh web（常驻）
├─ client watch: tsdown dev-web.ts     → lib/client.js → 浏览器自动热更
└─ host watch:   tsc -b --watch ×4     → lib/index.js → 重启 dsh web 生效
```

- `scripts/dev.ts` 同时启动「client watch」与「host watch」，子进程互监督，任一崩溃整体退出；
- `dev-web.ts` glob `packages/dsh-studio*`（单包），并忽略 host 源码与 `tsconfig.tsbuildinfo` 避免冗余 rebuild；
- client 面板改动零重启；host 改动只自动重编译，仍需重启 dsh web。

### 7.3 host 插件开发流程

```
改 src/**/*.ts → pnpm dev 自动重编译 lib/ → 重启 dsh web
```

### 7.4 多 profile 隔离（推荐）

- 开发用独立 profile：`dsh plugin --profile dev add -w packages/dsh-studio`；
- 日常 `web` profile 不受开发影响；
- 验证组合/开关完全在 `cordis.patch.yml` 上做，走 HMR 无需重启。

### 7.5 开发工具链

- **构建**：`pnpm build`（host tsc）、`pnpm build:client`（tsdown 产出 `lib/client.js`）；
- **热重载**：`pnpm dev`；
- **类型**：`pnpm typecheck`；
- **冒烟**：`dsh --profile dev "任务"` 或 `dsh web --dump-config`。

## 8. 局域网鉴权网关（dsh-studio-lan-auth）

> 状态：已实现并验证（2026-08-15/16）

### 定位与动机

DSH Web 界面刻意只监听 `127.0.0.1`，特权方法（settings/credentials/llm.discoverModels）锁 loopback。`dsh-studio-lan-auth` 不修改 `dsh-client-connection`，而是在边界加一层 **HTTPS 反向代理网关**，作为唯一暴露到局域网的入口。

```
局域网设备 ──HTTPS──▶ [网关 :3443 TLS] ──验 token/登录──▶ 本机 DSH web (loopback)
```

### 证书（零配置，私有 CA 方案）

- **首启自动生成私有 CA**：`cert.ts` 的 `ensureCertBundle` 在空目录时调用 `initPrivateCa`，生成根证书 `ca.pem` + 叶子 `key.pem`/`cert.pem`（SAN 自动收集本机全部局域网 IPv4 + `127.0.0.1` + `localhost`）。已有证书则原样使用、绝不覆盖。
- **登录页 CA 引导（.crt）**：首次访问浏览器点「继续访问」进入登录页后，页面检测 `hasCa` → 显示「下载根证书永久免警告」引导（`.crt`，MIME `application/x-x509-ca-cert`）。设备装一次后**永久免警告**；不装也能用（每会话点一次「继续访问」）。
- **CLI**：`dsh-studio-lan-auth init-ca [--ip ...]` / `dsh-studio-lan-auth status`。
- **Chrome「不安全」图标说明**：私有 CA（IP 直连）站点 Chrome 永远显示「不安全」——这是对非公共 CA 的固有提示，连接本身已加密受信任，无法（也不需要）消除。

### 关键决策

| 决策 | 值 |
|---|---|
| 形态 | 独立 HTTPS 反向代理网关（不改 client-connection / webServer） |
| TLS | 首启自动生成私有 CA；已有证书 verbatim；登录页 `.crt` 下载引导 |
| 本机 | loopback 免登录直通 |
| 局域网 | 需有效 token（`Authorization: Bearer` 或 `X-DSH-Token`）或账号密码登录 |
| 权限 | 全放行（网关转发走 loopback，DSH 视为 loopback 信任） |
| 管理 | **仅本机**：LAN 请求（带代理标记头）一律 403 |
| 默认 | **关闭**：host 挂载要求 `features["dsh-studio-lan-auth"] === true` 才调用 lan-auth apply |

### 认证与安全

- **token 过期**：静态 token 30 天绝对过期；会话 token（密码登录 `session:*`）12 小时滑动续期；`checkToken` 每次先清理过期 token；存量旧 token `load()` 自动回填 `expiresAt`。
- **登录爆破限速**：每身份（用户名；未知用户名按来源 IP）15 分钟内 >5 次失败锁定（进程内存态）；成功登录自动重置。
- **登出=吊销**：`/__dsh_studio_lan_logout` 撤销会话 token + 清 cookie（`Max-Age=0`）；登出按钮仅远程会话显示、有**二次确认**，且仅网关确认 200 才跳转。
- **安全模型（实测）**：LAN 无 token → 401；LAN 带 token 访问管理路由 → 403（`x-dsh-studio-lan-auth-proxy` 标记头）；本机管理 → 200。

### 用户开关（默认关）

```sh
dsh-studio enable dsh-studio-lan-auth     # 写 state.json → 重启后网关加载
dsh-studio disable dsh-studio-lan-auth    # 恢复默认关
```

token 通过 webui 设置页（settings.section「局域网鉴权」）或本机管理员路由 `/dsh-studio-lan-auth/tokens` 生成；明文只在生成时显示一次，存储为 sha256。

## 9. 桌面通知（notifier 子模块）

- 监听 `ctx.on('session/event')`，匹配 `turn/end`；按 `event.data.reason.kind` 区分 completed / error / aborted / blocked / max-tokens；
- 通知走平台原生工具、零 npm 依赖：macOS `osascript` / Linux `notify-send` / Windows PowerShell `Windows.UI.Notifications`；
- 类型依赖：`@deepseek-ai/dsh-session`（devDep，仅取 `SessionEvent` 类型）。

## 10. 定时任务（scheduler 子模块）

- 用户级 cron（5 字段：分 时 日 月 周），`*` / 范围 / 步进 / 列表；
- 持久化：`~/.dsh/dsh-studio-scheduler/tasks.json`（重启保留）；
- 管理路由：`GET/POST /dsh-studio-scheduler/tasks`，`PATCH/DELETE /dsh-studio-scheduler/tasks/:id`；
- 调度：每秒 tick 检查到期任务（分钟级防重复触发护栏）；任务命令走 `/bin/sh -c`（支持管道/变量，本地可信配置面）。

## 11. 输入历史（input-history 子模块）

- **纯 client surface 插件**：host 仅空 apply；浏览器逻辑走 `exports["./client"]`（`dsh.client` 声明）；
- slot：`conversation.composer.dock`（session 作用域）；
- 记录当前会话用户「已发送」的纯文本消息，每会话独立存 localStorage（上限 100 条）；
- ↑ / ↓ 在输入框回填历史，仅在「输入框聚焦 + 非 IME + draft 无命令/引用前缀」时接管；写回走官方唯一公开通道 `inputActions.setDraft`，不直接改 DOM。

## 12. WebUI 主题商店（webui 子模块）

设置页「主题商店」（`settings.section`，id `dsh-studio-webui-themes`）。功能分两层，全部跑在官方 `ui-theme` 的公开扩展点上，不替换官方主题：

- **全局界面调整**（与主题无关）：`ctx.theme.overrideTokens('dsh-studio-webui.global', { light, dark })` 叠加层——切到任何主题（含官方 light/dark/system）都生效，浅/深模式自动取对应值。
- **主题风格**（每主题独立）：`ctx.theme.register({ id, colorScheme, tokens })` + `ctx.theme.setTheme(id)`。预设按家族提供深色版 + 浅色版（海洋/樱/森林，共 6 个）；自定义主题可新建/编辑/删除。
- **生命周期**：`ThemeStoreController` 在插件 `apply()` 作用域创建并持有注册与叠加层，设置页面板开合不会注销正在使用的主题；插件卸载时 dispose。
- **持久化**：localStorage 存自定义主题 + 当前所选 + 全局调整；host 路由 `GET/POST /dsh-studio-webui/themes`、`POST /dsh-studio-webui/themes/delete` 落盘 `~/.dsh/dsh-studio-webui/themes.json`，跨浏览器/重启恢复。
- **开关**：功能 id `dsh-studio-webui`，默认开启，可用 `dsh-studio disable dsh-studio-webui` 或功能商店停用；停用后设置页不出现该面板、host 路由不挂载。

## 13. 桌面客户端（apps/dsh-runtime + apps/desktop）

逐一实现与验证：见 `docs/DESKTOP.md`。要点：

- **dsh-runtime**：内置 dsh 独立运行时（pin `@deepseek-ai/dsh` 0.1.0-rc.6），自带 Node（目标态方案 B）+ 全依赖树；当前 MVP 用 Electron 内置 Node（方案 A）。
- **desktop 壳**：Electron（electron-vite + electron-builder）——探测/复用 3080、self-spawn `web --port 0`、就绪 URL、退出清理、托盘、开机自启、错误页、更新链路（feed + sha512 + 原子切换 + 回滚）、窗口图标。
- **首启自动装全家桶**：仅自管实例，后台检测 web profile 的 dependencies 是否含 `dsh-studio`，未装则 `dsh plugin --profile web add -w dsh-studio`（尽力而为，失败仅记日志）。

## 14. CI 与发布

- **`ci.yml`**：push / PR 自动 `pnpm -r build` → `typecheck` → `test`；
- **`release.yml`**：`workflow_dispatch` 手动触发，默认 **dry-run**（只打包校验不上传）；`false` 时用 `NPM_TOKEN` 真实发布；发布前校验单包版本；
- 本地手动：`pnpm -r publish --access public --no-git-checks [--dry-run]`。

## 15. 参考

- dsh 源码：`refs/deepseek-harness/`（apps/cli/src/plugin.ts、packages/boot/app-boot、packages/extensions/ui-cordis、packages/extensions/cordis-host-runner）；

- 插件生态调研：`docs/research/dsh-plugin-ecosystem.md`。
