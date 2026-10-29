# 发布与收录流程

从代码到 `awesome-dsh-plugin.com` 插件页的完整流程。分四段：**收录前的准备 → 仓库前置条件 → 提交收录 PR → 合并后站点生效**，最后是维护与本项目实操记录。日常开发与发版命令见 [AGENTS.md](AGENTS.md)。

---

## 1. 收录前的准备

发版的完整步骤以 [AGENTS.md](AGENTS.md#发版) 为准（打 tag 由 CI 走 OIDC 发布，禁止本地 `npm publish`）。与收录相关、容易漏的只有几点：

- `package.json.repository.url` 必须指向 GitHub 仓库本身。列表站的 npm 映射（`scripts/probe-npm.mjs`）只认包自带的 `repository` 指回被收录仓库，防止重名包挂靠；**漏了这一项，站点永远不会显示 npm 安装命令。**
- `repository` 一经发布就固化在该版本 manifest 里；改仓库地址后要**重新发版**才会被探测到。
- 官方 `@deepseek-ai/*` 包用 `peerDependencies`，且 peer 范围要带显式预发布分支，否则 harness 的预发布版本会被静默排除，用户安装时报 `ERESOLVE`：

  ```jsonc
  // ❌ 看着宽，实际匹配不到 0.2.x-rc.N
  "@deepseek-ai/dsh-mcp-client": ">=0.2.1-0 <0.3.0"
  // ✅ 在匹配的元组上带预发布标签
  "@deepseek-ai/dsh-mcp-client": ">=0.2.1-0 <0.3.0 || >=0.3.0-0 <0.4.0"
  ```

npm 包不是收录的必要条件（列表也能从 GitHub 安装），但没有 npm 包就没有 npm 安装命令和下载量，市场会一直展示较慢的源码安装方式。

---

## 2. 仓库前置条件

列表 CI 会直接读仓库，缺一项会被 `Submission gate` 拦下或人工打回：

| 条件 | 检查方式 | 本项目状态 |
|---|---|---|
| `package.json` 声明 `dsh.bundle` | 读 `package.json`（根包或 `packages/` 等子包） | ✅ `{"patch": "./cordis.patch.yml"}` |
| 只有 `dsh.client` 不行 | 只声明 client 会被判为不可安装 | ✅ client 与 bundle 并存 |
| 根目录有 `cordis.patch.yml` | — | ✅ |
| 仓库创建满 1 天 | CI 自动检查仓库年龄 | ✅ 2026-10-25 创建 |
| 打了 `dsh-plugin` topic | 人工/扫描检查 | ✅ |
| 真实可用代码，非占位/纯 README | 人工读源码 | ✅ |
| 活跃维护 | 定期扫描，长期停更会被移除 | — |

可选但推荐：

- **图标**：`icon:` 只接受 GitHub 托管的 **PNG/JPG/WebP**，SVG 会被拒。仓库里的 `icon.svg` 不会自动使用，卡片回退到作者头像；想要图标就额外放一张方图（如 `assets/icon-180.png`）。
- **截图**：在 `package.json` 旁放 `screenshots.json`，列 1–8 个仓库内相对路径。写在自己的仓库里，之后换图不必再提 PR。

---

## 3. 提交收录 PR

列表数据在 `data/plugins/`，一个插件一个 YAML 文件；两个 README 由脚本生成，**不要手改**。

### 步骤

```sh
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone=false

# 新增一个文件，文件名必须等于 slug（url 推出的 owner__repo）
git checkout -b add-micln-dsh-mcp-autoload
git add data/plugins/micln__dsh-mcp-autoload.yml
git commit -m "Add micln/dsh-mcp-autoload"
git push fork add-micln-dsh-mcp-autoload
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --base main --head micln:add-micln-dsh-mcp-autoload \
  --title "Add micln/dsh-mcp-autoload"
```

一个 PR 最多 3 条；一个插件就是**一个文件**。README 改动可以不提交（合并后由 `sync-readme` 重新生成）；要提交的话必须与数据一致，且会带来生成行冲突。

### 条目字段

```yaml
url: https://github.com/micln/dsh-mcp-autoload   # 必须与仓库完全一致
name: micln/dsh-mcp-autoload                     # 链接文字，owner/repo 形式要与 url 一致
category: tools                                  # 见下方分类
description:
  en: '...'   # 必填，单行
  zh: '...'   # 可选，维护者会补
# icon: https://raw.githubusercontent.com/...png # 可选，GitHub 托管的位图
# tarball: https://github.com/.../releases/latest/download/x.tgz  # 不发 npm 时可选
```

限制与坑：

- **文件名**：`<owner>__<repo>.yml`，必须与 `url` 推出的 slug 完全一致，否则校验失败。
- **描述中含 `: `（冒号+空格）必须加引号**，否则 YAML 会当作嵌套键解析失败。中文全角冒号不受影响，加引号也无妨。
- **描述必须属实**：会被当作声明逐条对照源码，包括数字、命令、API 名称；夸大是打回最常见的原因。只说功能，不带营销词。
- **分类贴合实际做的事**，选不准维护者会改，不会因此打回。可用值：`agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun`。
- 不要写 `npm:` 字段（会被校验拒绝，npm 映射从 registry 自动采集）。
- 不要动别人的条目：一个 PR 只改自己那一条。

### CI 会跑什么

1. **PR check**：条目数上限、只允许 `.yml`、必须位于 `data/plugins/` 且只有一层、陈旧 fork 守卫（删除 >2 条会失败）、README 与数据一致性、`added-dates` 测试、awesome-lint 与站点构建。
2. **Submission gate**（PR check 完成后由 `workflow_run` 触发）：读目标仓库校验 `dsh.bundle`、仓库年龄（≥1 天）、是否 archived、是否 DSH 本体、是否纯聚合包。

两个都绿只是前置条件，**最终由维护者读源码决定是否合并**。

---

## 4. 合并后站点何时生效

最容易误解的一段：**条目合并不等于页面完整**。

| 内容 | 数据来源 | 生成时机 |
|---|---|---|
| 条目行、分类、描述、安装命令 | `data/plugins/*.yml` → README | 合并后 `sync-readme` 立即重新生成，随 push 构建上线 |
| npm 安装命令、下载量 | `data/npm-map.json`（Actions 缓存，不入库） | **只有 nightly / 手动 dispatch 才探测** |
| 详情页 README 正文 | `data/readmes.json`（Actions 缓存） | 同上 |

- 合并后的 push / `workflow_run` 构建会跳过探测（日志：`push build with cached probe data — skipping probes`），所以新条目上线时**先只有 `github:` 源码安装、没有 README**。
- nightly cron 为 `23 2 * * *`（UTC），实际常在 02:30–02:45 UTC 启动（北京时间 10:30–10:45），耗时约 12–47 分钟，且可能被推迟。跑完后 npm 安装命令与 README 自动补齐，**无需再提 PR**。
- 探测条件：
  - npm：`raw.githubusercontent.com/<repo>/HEAD/package.json` 的 `name` 对应的包存在，且 registry 该版本 `repository` 指向本仓库。
  - README：默认分支的 `README.md`（或其它 README 形态），上限 48 KB；`README.zh.md` 等同类文件提供中文正文。

### 验证命令

```sh
# 页面是否已带 npm 安装命令 / README 章节
curl -s https://awesome-dsh-plugin.com/zh/p/micln/dsh-mcp-autoload/ | grep -o 'dsh plugin[^<]*'

# nightly 是否跑过
gh run list --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --workflow "Build site from README" --event schedule --limit 3

# 条目与 PR 状态
gh pr view 10153 --repo awesome-dsh-plugin/awesome-dsh-plugin
```

---

## 5. 维护

- **改自己的条目**：只编辑 `data/plugins/<owner>__<repo>.yml`。需要预览可本地 `git clone` 列表仓库后跑 `npm ci && node scripts/generate-readme.mjs`（生成结果可提交但非必需）。
- **被打上 `held: author`**：表示需要修改，不是拒绝。修复推到**同一分支**，留**一条**评论说明改了什么；标签只会在重新评审后由人工摘掉，反复推送或催促不会加速。
- **分支落后 / 冲突**：投稿冲突几乎都发生在生成的 README 行上，由维护者 rebase 解决，不需要你处理。
- **失效条目**：仓库消失、归档或长期停更会被扫描标记，确认后移除。收录不是永久的。

---

## 6. 本项目实操记录（2026-10-28/29）

| 项 | 值 |
|---|---|
| 条目文件 | `data/plugins/micln__dsh-mcp-autoload.yml`（+6 / -0） |
| 分类 | `tools` |
| PR | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/10153 |
| CI | `PR check` ✅ 14m21s；`Submission gate` ✅；无 `held: author` |
| 合并 | 2026-10-28T17:12:58Z，commit `c33dbd0` |
| npm | `dsh-mcp-autoload@0.4.0`，`repository` 指回本仓库 |
| 站点生效 | 2026-10-29 nightly（构建 `40806730253`，02:30Z 起跑，2h0m）完成后，中英文页均出现 npm 安装命令与 README 正文 |

已确认探测条件满足：`HEAD/package.json` 的 `name` 为 `dsh-mcp-autoload`、`dsh.bundle` 存在；registry 最新版 `repository.url = git+https://github.com/micln/dsh-mcp-autoload.git`；`README.md`（5.7 KB）与 `README.zh.md`（5.3 KB）均可访问且远低于 48 KB 上限。
