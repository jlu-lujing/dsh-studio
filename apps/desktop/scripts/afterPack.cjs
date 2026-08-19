/**
 * electron-builder afterPack hook
 *
 * 把可运行的出厂 dsh-runtime 完整复制进 app 的资源目录。
 *
 * 为什么不用 extraResources：electron-builder 的 file-copy 规则会过滤掉顶层
 * node_modules（它假设那是 app 的依赖树），导致含 @deepseek-ai/dsh 全依赖树的
 * runtime 无法用 extraResources 原样带入。这里在 pack 之后、产物成型前用
 * cpSync 整体拷贝，绕开该过滤。
 *
 * 源目录：<repo>/apps/desktop/resources/dsh-runtime（开发态可运行 runtime；
 *   由 apps/dsh-runtime 构建产物解包而来，.gitignore 排除不提交）。
 * 目标：<appOutDir>/…/Resources/dsh-runtime（runtime.ts 的 process.resourcesPath
 *   分支会在启动时定位到它）。
 */
const { cpSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')

module.exports = async function afterPack(context) {
  const { appOutDir, packager } = context
  const resourcesDir = packager.getResourcesDir(appOutDir)

  // 1) 出厂 dsh-runtime
  const src = resolve(__dirname, '..', 'resources', 'dsh-runtime')
  if (existsSync(src)) {
    const dest = join(resourcesDir, 'dsh-runtime')
    cpSync(src, dest, { recursive: true })
    console.log('[afterPack] dsh-runtime 注入完成 →', dest)
  } else {
    console.warn(
      '[afterPack] 未找到出厂 runtime 目录（应执行 apps/dsh-runtime 构建后解包到' +
      ' apps/desktop/resources/dsh-runtime），跳过注入：',
      src,
    )
  }

  // 2) 托盘/窗口图标（打包后 process.resourcesPath 下要能读到 nativeImage）
  const iconsDir = resolve(__dirname, '..', 'build')
  for (const name of ['tray-16.png', 'tray-32.png', 'icon.png']) {
    const from = join(iconsDir, name)
    if (existsSync(from)) {
      cpSync(from, join(resourcesDir, name))
    }
  }
  console.log('[afterPack] 图标注入完成 (tray-16/32, icon.png)')
}
