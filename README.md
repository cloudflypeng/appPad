# appPad

`appPad` 是一个基于 Electron 的桌面应用，用图形界面管理 Homebrew 包，并提供 Mole
常用命令入口。

## 项目功能

1. Homebrew 管理

- 检测 Homebrew 是否安装、当前版本、最新版本。
- 支持安装、更新、全量升级。
- 提供 cask 残留强制清理能力。
- 状态缓存到本地 SQLite，页面优先显示缓存并后台刷新。

2. 分类包管理

- 提供 Browser / Terminal / Essentials / Tools 分类页。
- 每个条目支持安装、卸载、升级，命令输出统一进入全局终端面板。

3. Installed（已安装）页

- 展示已安装的 cask 与 formula。
- 识别可升级项（outdated），打上更新标签并优先排序到顶部。

4. Search（搜索）页

- 基于 `brew search` 搜索 cask/formula。
- 支持从搜索结果直接安装/卸载。
- 图标信息会缓存，缺失时自动补全。

5. Mole 管理

- 检测 Mole 安装状态、版本和安装来源。
- 支持 `mo update`、`mo clean`。
- 支持查询可卸载应用，并根据来源自动选择 `brew uninstall --cask` 或
  `mo uninstall`。

6. 应用更新

- 支持检查新版本、下载更新并安装。

7. 全局终端面板

- 所有命令统一输出到一个终端面板。
- 支持 `zsh / bash` 切换。

## 技术栈

- Electron + electron-vite
- React + TypeScript
- Tailwind CSS
- better-sqlite3（本地缓存数据库）
- xterm.js（内置终端）

## 本地开发

1. 安装依赖

```bash
pnpm install
```

2. 启动开发模式

```bash
pnpm dev
```

3. 类型检查

```bash
pnpm typecheck
```

## 构建

```bash
pnpm build:mac
```

## 发布流程

1. 本地发布命令

```bash
pnpm run release
```

该命令会自动：

- 递增 patch 版本号
- 提交版本相关文件
- 创建 `v<version>` 标签
- 推送 commit 与 tag

2. GitHub Actions

推送 `v*` 标签后会触发 `.github/workflows/tag-build.yml`，执行：

- 创建 GitHub Release
- 构建 macOS 产物
- 上传构建产物到 Release

## macOS 打开受限处理

如果系统提示应用损坏或阻止打开，可执行：

```bash
xattr -dr com.apple.quarantine /Applications/apppad.app
```
