# dsh-plugin 生态调研（GitHub topic 扫描）

> 日期：2026-08-15
> 数据源：GitHub `topic:dsh-plugin` API 检索（total 2303 仓库）+ 官方精选 `awesome-dsh-plugin`（365 插件，11 大类）

## 1. 生态概览

- `topic:dsh-plugin` 共 **2303** 个仓库，top 100 已抓取。
- 官方精选列表 `awesome-dsh-plugin/awesome-dsh-plugin`（CC0-1.0，1005★）收录 **365** 个可 `dsh plugin add` 安装的插件，分 11 类：
  UI Enhancements / Themes & Appearance / Sessions & Messages / Memory / Tools & Capabilities / Skills / Workflow & Automation / Notifications & Integrations / Models & Providers / Development & Runtime / Just for Fun。
- 生态配套：插件市场 `dsh-market`（dshmarket.com）、找插件的 Skill `dsh-find-plugins`、候选雷达 `awesome-dsh-plugins`。

## 2. Top 候选（按 star）

| star | 仓库 | 分类 | License |
|---|---|---|---|
| 93820 | deepseek-ai/deepseek-harness | 本体 | MIT |
| 3786 | crafter-station/petdex | 宠物素材库 | MIT |
| 1883 | zhu1090093659/dsh-web-ui | Web UI 全家桶（看板/Git图/宠物/皮肤） | Apache-2.0 |
| 1613 | anywhere-labs/deepseek-harness-desktop | 桌面端 | MIT |
| 1261 | liustack/modlens | 视觉/OCR | MIT |
| 1005 | awesome-dsh-plugin | 官方精选列表 | CC0 |
| 876 | ccch1mneyyy/dsh-TUI | 终端 TUI | MIT |
| 812 | AdamPlatin123/awesome-dsh-plugins | 候选雷达 | MIT |
| 742 | omdsh-dev/DSH-better-sidebar | 侧边栏工作台 | MIT |
| 574 | Small-tailqwq/dsh-deep-whale | 皮肤（鲸鱼娘） | CC BY-NC-SA |
| 541 | yejiming/MuseAI | 角色扮演 | ? |
| 433 | mnemon-dev/mnemon | 跨会话记忆（Go 二进制） | Apache-2.0 |
| 324 | Anionex/dsh-vision-toolkit | 视觉/OCR | MIT |
| 126 | vlln/whale-girl | 桌面宠物（.dsh-plugin 格式） | MIT |
| 88 | liustack/modsearch | 搜索桥 | MIT |
| 55 | csyangwen/dsh-memory-evolve | 纯 JS 跨会话记忆 | MIT |
| 43 | dsh-market/dsh-market | 插件市场 | null |
| 38 | omdsh-dev/dsh-notification | 桌面通知（我们已实现同类） | ? |
| 31 | titanwings/dsh-automation | 定时任务（我们已实现同类） | ? |

## 3. 与 dsh-kit 的关系分析

### 已覆盖（我们的 4 插件有同类实现）
- 桌面通知：`omdsh-dev/dsh-notification`（38★）≈ 我们 `dsh-kit-notifier`
- 定时/自动化：`titanwings/dsh-automation`（31★）≈ 我们 `dsh-kit-scheduler`
- 远程访问：`AcidGr/dsh-web-lan-access`、`Bernardxu123/dsh-mobile-gate` ≈ 我们 `dsh-kit-lan-auth`（且我们做得更完整：私有 CA + 爆破限速 + token 过期）

### v2 候选方向对应的现成优秀插件（可参考为自研蓝本）
| 我们 v2 方向 | 参考仓库 | 说明 |
|---|---|---|
| 记忆（跨会话长期记忆） | `csyangwen/dsh-memory-evolve`（55★，纯 JS 插件，MIT） | **最契合**：纯 DSH 插件、零依赖、随装随卸，正是"自己写"的蓝本 |
| 记忆（图记忆） | `mnemon-dev/mnemon`（433★，Go 二进制） | 功能强但需外部二进制，集成重 |
| 视觉/OCR | `liustack/modlens`（1261★）、`Anionex/dsh-vision-toolkit`（324★，OCR） | 成熟，可参考 |
| 搜索桥 | `liustack/modsearch`（88★，MIT，TS） | 问网页/X 返回结构化 JSON，方向明确 |
| 确定性工具包 | `omdsh-dev/dsh-toolkit`（MIT，TS） | 十个零依赖工具，已在 HANDOFF v2 候选 |
| 宠物 | `vlln/whale-girl`（126★，.dsh-plugin 格式）、`zealot00/dsh-pet`、`crafter-station/petdex`（素材库） | 对应我们保留的 pet-rs 方向，社区已有 JS 实现 |

## 4. 结论（可融入性）

1. **原则**：项目定为「自己写，不收录」（HANDOFF §5），本调研的价值在**为自研提供方向和蓝本**，而非直接收录。
2. **最值得参考的融入方向**（按契合成度排序）：
   - **记忆**：`dsh-memory-evolve` 是现成自研蓝本（纯 JS、零依赖、MIT）——我们 v2 第一候选。
   - **宠物**：社区 JS 方案（whale-girl / dsh-pet / petdex 素材）可替代/补充我们保留的 pet-rs 思路。
   - **搜索桥 / 视觉 / 工具包**：均为清晰可参考的自研目标。
3. **可直接作为依赖装入的**（若未来想在全家桶聚合）：`dsh-market`（商店）、`dsh-find-plugins`（找插件 Skill）等基础设施——但它们与我们"自己写商店"的定位重叠，不急于收录。
4. **License 兼容性**：绝大多数候选为 MIT / Apache-2.0（宽松），融入无阻碍；注意 `dsh-deep-whale` 是 CC BY-NC-SA（非商用）不适用。
