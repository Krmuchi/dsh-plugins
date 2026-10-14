# dsh-plugins

DeepSeek Harness 插件集合（monorepo）。`packages/*` 下每个目录都是**独立可安装**的 DSH 插件包。

## 包含的插件

| 包 | npm | 类型 | 一句话 |
| --- | --- | --- | --- |
| `dsh-perf-profiler` | [`@krmuchi/dsh-perf-profiler`](https://www.npmjs.com/package/@krmuchi/dsh-perf-profiler) | 观测 | 记录每次工具调用、模型流式请求与审批等待的耗时——先测量，再优化 |
| `dsh-shell-rescue` | [`@krmuchi/dsh-shell-rescue`](https://www.npmjs.com/package/@krmuchi/dsh-shell-rescue) | 修复 | 内置 `pwsh` 工具在进程创建前失败时透明改走直连通道，省掉整轮模型恢复往返 |

共同特征：**零第三方依赖**、纯 Node ESM、只做观测或兜底、任何内部失败都静默放行、不影响主流程。

## 安装

### 插件市场（推荐）

打开 DSH 的**设置 → 插件市场**，搜索插件名，点安装。

### 命令行

```
dsh plugin --profile web add @krmuchi/dsh-perf-profiler
dsh plugin --profile web add @krmuchi/dsh-shell-rescue
```

### 本地源码（开发用）

在 DSH 的「插件管理」中安装，spec 填对应包路径（替换为你的实际克隆路径）：

```
link:<仓库路径>/packages/dsh-perf-profiler
link:<仓库路径>/packages/dsh-shell-rescue
```

或手动编辑 profile 的 `package.json`（`dependencies` 加 `link:` 项、`dsh.profile.bundles` 追加包名），
在 profile 目录执行 `pnpm install`，重启 DSH 激活。详见各包 README。

> **为什么推荐 `link:` 而不是 `file:`**：`link:` 是符号链接，profile 中与源码是同一份文件；
> `file:` 是复制快照，改源码后不会跟随更新。

## 设计背景

这套工具源于一次真实的性能排查（DSH + Windows），实测数据如下：

| 观测项 | 实测占比 | 均值 |
| --- | --- | --- |
| 模型往返（`llm.stream`） | **97.8%** | 33.8 s/次 |
| 工具执行（`tool.execute`） | **1.8%** | 327 ms/次 |
| 审批等待（`approval.request`） | 0%（策略为 never） | — |

结论：**"工具执行慢"的体感，主要来自模型往返轮次与失败后的恢复轮次，而非工具本身。**
所以这里做的不是"更快的工具"，而是两件更有价值的事：

1. **先量化**（`dsh-perf-profiler`）—— 避免凭感觉优化
2. **消除失败恢复的浪费**（`dsh-shell-rescue`）—— 一次工具失败通常要烧掉一整轮模型往返

## 目录结构

```
packages/
├── dsh-perf-profiler/   # 性能剖析（观测型）
└── dsh-shell-rescue/    # shell 进程创建失败兜底（修复型）
```

## License

MIT
