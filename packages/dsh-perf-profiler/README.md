# dsh-perf-profiler

DeepSeek Harness 性能剖析插件：**先测量，再优化**。把每一步时间花在哪里记录下来，
避免凭感觉优化。零依赖、纯 Node ESM，只做观测，不影响正常执行。

## 记录什么

| 记录类型 | 挂钩点 | 说明 |
| --- | --- | --- |
| `tool.execute` | `tools/execute` | 每次工具派发的总耗时（含内联审批等待） |
| `tool.result` | `tools/result` | 最终结果是否报错、结果体积 |
| `llm.stream` | `llm/stream` | 每次模型流式请求总耗时、首 token 延迟（TTFT）、chunk 数 |
| `approval.request` | `approval/request` | 每次让人确认审批的等待时长 |

## 输出

- `<outputDir>/perf.jsonl` — 每行一条 JSON 记录（`ts` / `kind` / `subject` / `durationMs` / …）
- `<outputDir>/summary.json` — 按 `kind:subject` 聚合的 count / avgMs / maxMs（每 10 条记录落盘一次）

默认 `outputDir = ~/.dsh/perf`。

## 安装

### 方式 A：插件管理器（推荐）

在 DeepSeek Harness 的「插件管理」里安装，spec 填本包路径（替换成你的实际克隆路径）：

```
link:<本仓库路径>/packages/dsh-perf-profiler
```

例如仓库克隆在 `D:\plugins\dsh-plugins`：

```
link:D:/plugins/dsh-plugins/packages/dsh-perf-profiler
```

### 方式 B：手动

1. 编辑 `~/.dsh/profiles/<profile>/package.json`：
   - `dependencies` 加 `"dsh-perf-profiler": "link:<本仓库路径>/packages/dsh-perf-profiler"`
   - `dsh.profile.bundles` 数组追加 `"dsh-perf-profiler"`
2. 在 profile 目录执行 `pnpm install`
3. 重启 DSH 激活

### 配置输出目录

在 profile 的 `cordis.patch.yml` 里按 id 覆盖：

```yaml
- id: dsh-perf-profiler
  name: dsh-perf-profiler
  config:
    outputDir: /path/to/perf-logs
```

## 验证

随便跑几个工具，然后看 `<outputDir>/perf.jsonl` 是否出现新行；把 `summary.json` 交给 agent
即可分析出结论（哪类工具慢、模型 TTFT、审批占比）。

## 数据如何指导优化

- **`tool.execute` 占大头** → 常驻 shell / 合并命令 / 结果缓存
- **`llm.stream` 次数多、TTFT 高** → 减少模型往返轮次、裁剪工具 schema 降低 prefill
- **`approval.request` 总时长高** → 调整权限预设与放行规则，而不是改代码

## 开发注意事项（踩过的坑）

- **不要用 `ctx.setInterval`**：`timer` 是服务，未声明 `inject: ['timer']` 时 Cordis 访问该属性会直接抛
  `cannot get property "timer" without inject`，导致插件整体激活失败。本插件改用 `ctx.effect` 注册清理。
- **改代码不会热生效**：DSH loader 按模块 specifier 缓存 ESM 模块，改 `lib/index.js` 后即使
  禁用再重新启用也不会重新 import；需要**重启 DSH**，或换用新的模块 specifier（新包名 / 子路径导出）。
- 首次安装后状态可能是 `restart-required`，重启 DSH 才会激活。

## License

MIT
