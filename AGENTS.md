# dsh-mcp-autoload 开发约定

DSH 插件：自动发现项目级 `.agents/mcp.json`，按会话挂载其中的 MCP server，并在 Web UI 提供会话内的启停面板。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | host 侧 Cordis 插件 + Typert Remote 服务（`mcpAutoload/status`、`mcpAutoload/setEnabled`） |
| `client.js` | 浏览器端 UI bundle（`window.__ModuleLoader__.load`），镜像 host 的 Remote descriptor |
| `wire.js` | 两端共享的 descriptor 契约。浏览器 bundle 不能 import host 模块，所以两边是**手工同步**的副本 |
| `manifest.js` | `.agents/mcp.json` 的读改写：加锁、备份、原子替换、写后校验 |
| `cordis.patch.yml` | bundle patch，由 `package.json` 的 `dsh.bundle.patch` 声明 |
| `manifest.test.js`、`wire.test.js` | `node --test` 用例 |
| `PUBLISHING.md` | 发版与 awesome-dsh-plugin 收录流程：npm 绑定、收录前置条件、条目格式、合并后站点生效时序 |

两条硬约束：

- 改 `wire.js` 里任一 descriptor 的参数或结果 schema，**必须同步改 `client.js` 里的镜像**，否则 `wire.test.js` 会失败。
- 新增运行时文件必须同步加进 `package.json` 的 `files` 白名单，否则不会进发布包（`manifest.js` 曾漏掉过，会发布出坏包）。

## 命令

```sh
npm test            # node --test，跑 manifest.test.js 与 wire.test.js
npm pack --dry-run  # 核对发布清单：必须包含全部运行时文件，且不含测试与临时文件
```

## 发版

版本由 tag 触发 CI 发布。**不要本地 `npm publish`**——账号的 token 已被 2FA 策略禁用，只有 CI 的 OIDC 能发。完整流程（收录 PR、两项 CI 检查、合并后 npm 安装命令与 README 的站点生效时序）见 [PUBLISHING.md](PUBLISHING.md)。

```sh
git checkout master && git pull origin master
# 编辑 package.json 的 version，必须等于 tag 去掉 v 前缀
git commit -am "chore: release X.Y.Z"
git push origin master
git tag vX.Y.Z && git push origin vX.Y.Z
```

`.github/workflows/publish.yml` 在 `v*` tag 推送时执行：校验 tag 与 `package.json` version 一致 → `npm test` → `npm publish`（Trusted Publishing / OIDC，自动带 provenance）→ 创建 GitHub Release。版本已存在时自动跳过发布。

其他约定：

- 只用 GitHub（remote `origin`，`git@github.com:micln/dsh-mcp-autoload.git`）；Gitea 仓库已不再维护。
- tag 必须打在包含该 workflow 的提交上，不要往更早的提交打 tag。
- 发布后核对 `npm view dsh-mcp-autoload dist-tags`（`latest` 应指向新版本）。registry 有几十秒传播延迟，别把延迟误判成失败。
- `npm deprecate` / `npm unpublish` 不支持 OIDC，需要人工 OTP。

## 代码约定

- 全 ESM，**无构建步骤**（源码即发布产物），2 空格缩进，单引号。
- MCP server 名进入 `McpClient.Config` 之前必须经 `normalizeServerName`：`@deepseek-ai/dsh-mcp-client` 的 `serverName` 带 `^[A-Za-z0-9_-]{1,32}$` 校验，中文名或超长名不规范化会直接抛错。
- 改写用户的 `.agents/mcp.json` 必须走「加锁 → 备份 → 原子 rename → 写后校验」，且任何失败路径都不允许留下「文件声称的状态与会话实际能做到的状态不一致」。禁用时应先卸载成功再写盘。
- 不要声明未使用的 `peerDependencies`（曾出现幽灵依赖 `@deepseek-ai/dsh-atomic-write`，npm 上也没有匹配的稳定版本）。
- 备份文件（`.bak-<时间戳>-<uuid>`）只保留最近 5 份；清理时只匹配本模块产出的文件名，绝不按前缀乱删。

## 多会话

这个目录常年有多个会话并行工作。改动一律在 worktree 里做：

```sh
git worktree add /tmp/<name> master   # 在隔离目录里改
# ... 只显式 git add 自己改的文件，禁止 git add -A ...
git worktree remove /tmp/<name>       # 收尾，并核对主工作区未被污染
```
