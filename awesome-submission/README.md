# 上架 awesome-dsh-plugin（插件市场收录）

DSH 的插件市场（`dshmarket`）**不自己收录插件**，它每次打开都实时拉取精选列表
<https://awesome-dsh-plugin.com/plugins.json>。要让插件出现在市场里，只需往下面这个仓库提一个 PR：

- 仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
- 站点：<https://awesome-dsh-plugin.com>
- 生效时间：合并后通常一天内（CI 每日刷新 `plugins.json`）

**不要**往 `dsh-market/dsh-market` 提插件条目——那个仓库是市场应用本身。

## 前置条件

1. 两个包已发布到 npm（见仓库根 README 的发布命令）
2. npm 上 `@krmuchi/*` 可见：`npm view @krmuchi/dsh-perf-profiler version`
3. 本仓库已推送到 GitHub，README 里有 `dsh plugin add` 安装命令

## 提交步骤

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`
2. 在列表文件里按既有格式追加两条（字段见下）
3. 提 PR，标题建议：`Add @krmuchi/dsh-perf-profiler and @krmuchi/dsh-shell-rescue`

## 条目的字段来源

市场卡片显示的字段，与 `plugins.json` 条目一一对应：

| 字段 | 来源 |
| --- | --- |
| `name` | 包名（scoped 包去掉 scope 或保留，以列表既有惯例为准） |
| `owner` | GitHub 用户名 |
| `url` | 插件源码仓库地址 |
| `category` | 列表的分类键（见下） |
| `description.en` / `.zh` | 卡片描述，中英各一 |
| `npm` | npm 包名 |
| `install` | 安装命令原文 |
| `screenshots` | 可选，建议放仓库内 `docs/screenshots/` 的 GitHub 图床地址 |

本仓库已按此结构预填了 `entry-perf-profiler.json` 与 `entry-shell-rescue.json`，
提 PR 时按目标仓库的实际格式（可能是 README 表格而非 JSON）对应填写即可。

## 分类选择

`plugins.json` 现有 23 个分类，与本仓库两个插件相关的是：

- `dev` — Development & Runtime（开发与运行时）→ **dsh-perf-profiler**
- `wsl` — WSL & Windows Interop（WSL 与 Windows 互操作）→ **dsh-shell-rescue**
- 备选：`tools` — Tools & Capabilities（工具与能力），两者都沾边

## 能力标注（capabilities）

列表 CI 会静态分析插件源码并标注能力，同时列出"红线"组合。预判结果：

| 插件 | 预期 capabilities | 红线 |
| --- | --- | --- |
| dsh-perf-profiler | `fs-write`（写 `~/.dsh/perf/*.jsonl`）、`fs-read` | 无 |
| dsh-shell-rescue | `shell`（spawn 子进程）、`fs-read`、`env`（读注册表/环境变量探测 pwsh） | 无 |

`dsh-shell-rescue` 因为会执行命令，市场在网页版安装时会有明确提醒，这是预期行为。

## 描述文案（可直接用）

### dsh-perf-profiler

- **en**: Records how long every tool call, streaming model request and approval wait takes — measure first, then optimise. Writes perf.jsonl and an aggregated summary.json.
- **zh**: 记录每次工具调用、模型流式请求与审批等待的耗时——先测量，再优化。输出 perf.jsonl 与聚合后的 summary.json。

### dsh-shell-rescue

- **en**: When the built-in pwsh tool fails before the process is created, runs the same command through a direct node:child_process channel and returns the built-in tool's own foreground shape — saving a whole model round-trip per failure.
- **zh**: 内置 pwsh 工具在进程创建前失败时，改走直连 node:child_process 执行同一条命令，并返回内置工具同形的 foreground 结果——每次失败省下整轮模型往返。
