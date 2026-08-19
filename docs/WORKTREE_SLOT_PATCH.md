# DSH 前端运行时补丁：`conversation.hero.worktree` 槽

> 状态：本地开发所需的 DSH 运行时补丁（不随 npm 分发）
> 版本：DSH `@deepseek-ai/dsh` 0.1.0-rc.6

## 为什么有这份补丁

`dsh-studio-worktree` 的「新建会话页 worktree 选择器」要求与官方「项目文件夹 /
模式 preset」**同一行**渲染。但 DSH 官方前端新会话那一行是死的三样：

- `WorkspaceChip`（项目文件夹）
- `conversation.hero.workspace`（`kind: single`，官方已占用）
- `conversation.hero.agentPreset`（`kind: single`，官方已占用）

官方 **没有**第三个并排槽位，所以要让 worktree 选择器并排，必须在 DSH 前端
的 `dsh-client-ui-conversation` 里新增一个槽：`conversation.hero.worktree`
（`kind: single, scope: root`）。

这是一处对 **DSH 运行时本地副本**的侵入性补丁（仓库一贯的「不侵入
`@deepseek-ai/*`」边界，在这里为满足「绝对同行」而破例），**不随仓库 npm
包分发**，升级 / 重装 DSH 后需要重新打。

## 改了哪些文件

给 **`dsh-client-ui-conversation/lib/client.js`** 加两处（两处一并修改）：

1. **slot 声明**：在其 slot 注册表里新增
   ```json
   "conversation.hero.worktree": { "kind": "single", "scope": "root" }
   ```
   位置：`conversation.hero.workspace` 声明之后。

2. **渲染点**：在 `heroWorkspaceRow` 里、`renderSlot("conversation.hero.agentPreset", {})`
   之前插入
   ```js
   renderSlot("conversation.hero.worktree", {}),
   ```
   这样它就成了那行里的第三个元素，和项目文件夹 / preset 并排。

被改的实际文件（两份，需保持字节一致）：

```
apps/desktop/resources/dsh-runtime/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js
<全局 dsh>/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js
```

每次改动都会用 `git worktree list` / `cmp` 与运行中的服务端实际 serve 的 bundle
（`/plugins/@deepseek-ai/dsh-client-ui-conversation/client.js`）核对是否命中。

## 如何打补丁

一条小脚本（Node，读取目标文件、插入声明 + 渲染点），已在本机反复使用：

```js
// patch-conv.mjs <path-to-client.js>
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
const target = process.argv[2]
let s = readFileSync(target, 'utf8')
if (s.includes('"conversation.hero.worktree"')) { console.log('already patched'); process.exit(0) }

const blockNeedle = '"conversation.hero.agentPreset": {\n\t\t\t\t\t\tkind: "single",\n\t\t\t\t\t\tscope: "root"\n\t\t\t\t\t}'
const blockRepl = blockNeedle + ',\n\t\t\t\t\t"conversation.hero.worktree": {\n\t\t\t\t\t\tkind: "single",\n\t\t\t\t\t\tscope: "root"\n\t\t\t\t\t}'
if (!s.includes(blockNeedle)) throw new Error('block needle not matched')
s = s.replace(blockNeedle, blockRepl)

const renderNeedle = 'renderSlot("conversation.hero.agentPreset", {})'
if (!s.includes(renderNeedle)) throw new Error('render needle not found')
s = s.replace(renderNeedle, 'renderSlot("conversation.hero.worktree", {}),\n\t\t\t\t\trenderSlot("conversation.hero.agentPreset", {})')

copyFileSync(target, target + '.local-backup')
writeFileSync(target, s)
console.log('patched ok:', s.includes('conversation.hero.worktree'))
```

## 验证

打完后起一个临时实例（注意 lan-auth 默认开，会 3443 冲突，验证时临时 `disable`
lan-auth）：

```
curl -s http://127.0.0.1:<port>/ |
  grep -o 'dsh-studio-worktree/client.js?rev=[a-f0-9]*'
curl -s http://127.0.0.1:<port>/plugins/@deepseek-ai/dsh-client-ui-conversation/client.js |
  grep -c 'conversation.hero.worktree'   # 期望 2
curl -s http://127.0.0.1:<port>/plugins/dsh-studio-worktree/client.js |
  grep -c 'conversation.hero.worktree'   # 期望 >=1（注册槽）
```

## 什么时候要重新打

- DSH 升级 / 重装（`@deepseek-ai/dsh` 版本变化）；新增节点重新 clone / 部署。
- 桌面端 `dsh-runtime` 更新 feed 切换（`updater` 替换 runtime 后需重新打）。

## 关联

- 插件代码：`packages/dsh-studio-worktree/`
  - `src/client/index.ts` —— 注册 `conversation.hero.worktree`（新建会话同行）
  - `src/client/dock.ts` —— 进行中对话输入区下方的「当前 + 在新 worktree 新建会话」
  - `src/client/selector.ts` / `badge.ts` —— 新建页选择胶囊 / 会话头部徽标
- 参考实现：https://github.com/FlashingChen/dsh-worktree（agent tools + /worktree 命令 + 永久 manifest；本插件走 UI 形式）
