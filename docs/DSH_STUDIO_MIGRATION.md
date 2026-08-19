# DSH Studio · 品牌迁移与单包化重构

> 状态：已完成（2026-08-19，阶段 0–4 全部落地）
> 目标：全仓库品牌统一为 **DSH Studio**；把 7 个 `dsh-kit*` 包合并为 **1 个 `dsh-studio` 包**。

## 1. 背景与目标

当前仓库以 7 个 `dsh-kit*` npm 包 + `DeepSeek Harness` 品牌发布。本次要做两件事：

1. **品牌迁移**：所有用户可见品牌、文档、预设、主题、产物名，从 `DeepSeek Harness` / `DeepSeek` / `dsh-kit` 统一为 **DSH Studio**。
2. **单包化**：7 个包合并成 **1 个 `dsh-studio` 包**（内部按功能分子目录）。

**边界（谁不改）**：
- 官方 dsh：`@deepseek-ai/dsh`、`dsh` 命令、官方包名（`@deepseek-ai/*`）、`dsh-runtime` 内部 —— 保留（我们是**基于 dsh 定制**）。
- 生态目录/第三方仓库名（`ecosystem-fallback.json` 里的 GitHub 项目）—— 不改（那是别人的项目）。

## 2. 现状盘点

### 2.1 包结构（7 包 → 1 包）

| 现状包 | 功能 | 合并去向（`packages/dsh-studio/src/`） |
|---|---|---|
| `dsh-kit` | 聚合底座（CLI/功能商店/生态/归档/preset） | `src/`（根，即底座逻辑） |
| `dsh-kit-notifier` | 桌面通知 | `src/notifier/` |
| `dsh-kit-input-history` | 输入历史 | `src/input-history/` |
| `dsh-kit-scheduler` | 定时任务 | `src/scheduler/` |
| `dsh-kit-worktree` | git worktree | `src/worktree/` |
| `dsh-kit-lan-auth` | 局域网网关 | `src/lan-auth/` |
| `dsh-kit-webui` | 主题商店 | `src/webui/` |

### 2.2 品牌出现

- 全仓库 `DeepSeek / DeepSeek Harness / dsh-kit` 相关出现约 **931 处**（扫描于 2026-08-19）。
- 主要集中在：桌面端（窗口标题/托盘/启动页）、docs、`dsh-kit-webui`（面板/主题），以及 7 个包的包名/import/依赖。

### 2.3 关键改动面

- **包名**：`dsh-kit` / `dsh-kit-*` → `dsh-studio`（1 个）
- **CLI bin**：`dsh-kit` → `dsh-studio`
- **仓库**：`jlu-lujing/dsh-kit` → `jlu-lujing/dsh-studio`（镜像/改 remote 后可做）
- **版本**：保持 0.2.1（本次不升版本）

## 3. 目标目录结构

```
packages/dsh-studio/
├── package.json          # 合并后单一包（bin: dsh-studio）
├── tsconfig.json
├── tsdown.config.ts
├── bin/
│   └── dsh-studio.mjs    # CLI
├── preset/               # TurboBoost/满血 preset + j-space skill
├── cordis.patch.yml      # 聚�� patch（含全部功能行）
├── src/
│   ├── index.ts          # 聚合入口
│   ├── store.ts          # 功能开关
│   ├── state.ts
│   ├── preset.ts
│   ├── archive.ts
│   ├── ecosystem.ts
│   ├── notifier/         # 原 dsh-kit-notifier
│   ├── input-history/    # 原 dsh-kit-input-history
│   ├── scheduler/        # 原 dsh-kit-scheduler
│   ├── worktree/         # 原 dsh-kit-worktree
│   ├── lan-auth/         # 原 dsh-kit-lan-auth
│   └── webui/            # 原 dsh-kit-webui
└── client/
    └── index.ts          # client bundle 入口（合并各 client）
```

## 4. 执行阶段

每阶段独立提交、可验证（typecheck/build/test 绿），可回退。

### 阶段 0：清理 & 基线
- 处理临时/未提交文件（`apps/desktop/build/dsh-studio*.svg`、`release.mjs` 路径修复等）。
- 确认 `pnpm build` / `pnpm test` 全绿作为基线。

### 阶段 1：建 `dsh-studio` 单包，合并 7 包源码
- 新目录 `packages/dsh-studio/`，按 §3 结构组织。
- 把 7 包源码移入对应 `src/<feature>/` 子目录；合并 package.json/tssconfig/tsdown/patch。
- 统一 import 路径（`packages/dsh-kit-x` → `packages/dsh-studio` 内部相对/别名）。
- 先把旧包移到 `packages/_legacy/` 备份，不删。

### 阶段 2：品牌替换
- 全仓库 `DeepSeek Harness` / `DeepSeek`（我们的上下文）→ `DSH Studio`。
- 排除：官方 `@deepseek-ai/dsh`、生态第三方名。
- 桌面端：窗口标题、托盘 tooltip、启动页文字、应用名（electron-builder `productName`）。
- `dsh-kit-webui` 面板/主题描述里的品牌。
- preset / j-space skill 内的品牌提及。

### 阶段 3：改名接线
- 包名 `dsh-kit*` → `dsh-studio`：package.json name、bin、import、内部依赖、cordis patch、plugin ID。
- 更新 `apps/desktop` 对全家桶的引用（plugins.ts 的安装/检测）、`pnpm-workspace.yaml`、CI（`.github/`）、`scripts/`。
- CLI 命令 `dsh-kit` → `dsh-studio`。
- 状态文件（`~/.dsh/dsh-kit/` → `~/.dsh/dsh-studio/`）——迁移兼容（旧路径读不到时回落默认）。

### 阶段 4：��证 & 收尾
- `pnpm -r build` / `typecheck` / `test` 全绿。
- 桌面启动冒烟。
- 确认 `_legacy` 备份无引用后删除（或保留一代）。
- 更新 docs（HANDOFF/README/ARCHITECTURE/DESKTOP）品牌。

## 5. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 包合并破坏 import/依赖 | 阶段 1 独立提交 + `tsc -b` 验证；旧包保留在 `_legacy` |
| 品牌替换误伤官方/第三方 | 白名单排除：`@deepseek-ai/`、ecosystem 第三方；sed 前先 grep 审查 |
| 桌面/CI 引用旧包名挂掉 | 阶段 3 一起改，不遗留 |
| 状态文件路径变更丢配置 | 读旧路径兼容迁移 |

## 6. 待办清单（Checklist）

- [x] 阶段 0：基线绿 + 清理临时文件
- [x] 阶段 1：`packages/dsh-studio` 建包、7 包源码迁入、import 统一、旧包进 `_legacy`
- [x] 阶段 2：全仓库品牌 → `DSH Studio`（排除白名单）
- [x] 阶段 3：包名/bin/依赖/桌面/CI/状态路径 → `dsh-studio`
- [x] 阶段 4：build/typecheck/test 绿、客户端 bundle 构建、docs 更新

> 收尾备注（2026-08-19）：
> - 提交：`82ad478`（单包化）、`d5cf636`（品牌替换）
> - 门禁：`pnpm build` / `pnpm build:client` / `pnpm typecheck` / `pnpm test`(43) / 桌面 node typecheck 全绿
> - 旧包保留在 `packages/_legacy/`（一代备份，不参与 workspace）；CI 增加 `build:client` 步骤产出单一 client bundle

## 7. 命名约定

- 产品显示名：**DSH Studio**
- npm 包名 / CLI bin / 目录：`dsh-studio`
- 功能内部目录：`src/<feature>/`（notifier/scheduler/lan-auth/webui/worktree/input-history）
- 官方保留：`@deepseek-ai/dsh`、`dsh` 命令、`dsh-runtime`
