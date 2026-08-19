# dsh-runtime — 内置 dsh 独立运行时子模块

> 版本：0.1.0-rc.6
> 相比主包：天生与桌面壳解耦，有自己的版本号与更新通道，可脱离 Electron 壳单独更新。

## 是什么

一个**独立子模块**，包含：

- 官方 Node 二进制（`node/bin/node`，当前目标 24.x LTS）
- 完整安装的 `@deepseek-ai/dsh` 及其全部依赖（`node_modules/`，含平台原生 prebuild）
- `runtime.json`（dsh 版本 / Node 版本 / 平台 / 架构 / 构建时间 / schemaVersion）
- `VERSION`（冗余文本版本，便于排障）

## 构建

```sh
cd apps/dsh-runtime
npm ci --omit=dev     # 按 package.json 解析 @deepseek-ai/dsh 精确版本
node scripts/build.mjs            # 裁剪 + 写 runtime.json + 打 zip（zstd，M1）
node scripts/build.mjs --tar-gz   # 额外产出 tar.gz（M4 更新链路，纯 JS 可解）
```

构建脚本从**本机已验证的 dsh 安装**（`npm root -g` 下的 `@deepseek-ai/dsh`）取材，而不是重新 `npm install`：

- 全局安装的 dsh 是 `0.1.0-rc.6` 且已验证可用（含 ready 行 `dsh web: http://127.0.0.1:<port>`）；
- 直接复用其已装好的扁平依赖树（含 node-pty / sharp / koffi 平台 prebuild），省去整树重装；
- 剥离 `@deepseek-ai/dsh` 包内部那份**重复的嵌套 node_modules**、非当前平台的原生 prebuild、`*.map` 与 `*.tsbuildinfo`，体积大幅下降并仍可运行。

产出：

```
dsh-runtime-<dshVersion>-<platform>-<arch>.zip
```

## 冒烟验证

```sh
node scripts/smoke.mjs
```

用构建出的 node 二进制（或回退 Electron 内置 Node）以 `--expose-internals` 启动 `web --port 0`，
解析 ready 行 `dsh web: http://127.0.0.1:<port>` 并 `GET /` 校验 200 + 页面含 `__DSH_BOOT__`。

## 与桌面壳的关系

- 出厂版本：`apps/desktop` 打包时随 `resources/dsh-runtime/` 进入安装包；
- 更新版本：写入用户数据目录 `<userData>/dsh-runtime/current/`，原子切换；
- 壳只用两个契约：`runtime.json`（版本/平台校验）+ spawn 的 ready 行；
- 详见 `../../docs/DESKTOP.md`。
