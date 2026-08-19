# packages/_legacy — 历史存档

> 本目录是 **DSH Studio 单包化改造前**的旧 7 个 `dsh-kit*` npm 包备份。

为满足「以客户端为主、一个完整产品」的定位，DSH Studio 已把所有功能收敛为
**单一 `packages/dsh-studio` npm 包**（聚合 + 六个功能子模块）。旧 7 包不再发布、
不参与 pnpm workspace（见根 `pnpm-workspace.yaml` 的排除规则），仅作历史存档
保留，避免丢失迁移前的实现。

| 旧包 | 现归属 |
| --- | --- |
| `dsh-kit` | `packages/dsh-studio/src`（聚合底座） |
| `dsh-kit-notifier` | `src/notifier/` |
| `dsh-kit-input-history` | `src/input-history/` |
| `dsh-kit-scheduler` | `src/scheduler/` |
| `dsh-kit-worktree` | `src/worktree/` |
| `dsh-kit-lan-auth` | `src/lan-auth/` |
| `dsh-kit-webui` | `src/webui/` |

> ⚠️ 任何新开发请勿在本目录进行；它仅用于追溯历史实现。需要对应能力时，
> 统一以 `packages/dsh-studio` 为主要入口。
