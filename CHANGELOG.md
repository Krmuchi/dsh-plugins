# Changelog

## packages/dsh-perf-profiler

### 0.1.0

- 初版：记录 `tools/execute`、`tools/result`、`llm/stream`、`approval/request` 四类事件，
  输出 `perf.jsonl`（逐条）与 `summary.json`（按 `kind:subject` 聚合）
- 修正：不使用 `ctx.setInterval`（`timer` 属于服务，未声明 `inject: ['timer']` 时访问该属性会直接抛错，
  导致插件整体激活失败），改用 `ctx.effect` 注册清理

## packages/dsh-shell-rescue

### 0.3.0

- **重命名为 `dsh-shell-rescue`**（前身包名为 `dsh-shell-rescue3`，仅因 loader 模块缓存问题而递增）
- 可执行文件多路解析：`config.executable` → 环境变量 → 标准目录 → `PATH` 扫描 →
  **注册表安装位置探测** → Windows PowerShell 5.1 兜底
- 注册表探测解决"刚装完 PowerShell 7、PATH 尚未刷新到运行中进程"的窗口期，**无需重启 DSH 即可生效**

### 0.2.0（前身 `dsh-shell-rescue2`）

- 不再转调 `pwsh_direct`，改为自建**规范 foreground value**
  （`kind` / `exitCode` / `signal` / `timedOut` / `aborted` / `timeoutMs` / `stdout` / `stderr`），
  以通过内置 `pwsh` 的 `output.schema` oneOf 校验

### 0.1.0（初版 `dsh-shell-rescue`）

- 通过 `tools/execute` waterfall 检测"进程创建前失败"并转调 `pwsh_direct`
- 已知缺陷：`pwsh_direct` 的返回 `value` 是字符串，无法通过内置 `pwsh` 的 oneOf 对象校验

## 工程笔记（踩坑记录）

1. **Cordis 服务访问门禁**：访问未声明 `inject` 的服务（如 `ctx.timer`）会直接抛
   `cannot get property "..." without inject`，导致插件整体激活失败。
2. **loader 的 ESM 模块缓存**：DSH loader 按模块 specifier 记忆模块，改文件内容、禁用再启用都不会重新
   import；需**重启 DSH**，或换用新的 specifier（新包名 / 子路径导出）。
3. **工具输出 schema 校验**：工具结果会按**该工具自己的** `output.schema` 校验；
   替换其他工具的结果时必须逐字段构造同形 `value`（形状不匹配会以
   `"value" must match exactly one oneOf branch` 失败）。
4. **Windows Program Files 重定向**：注册表
   `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\ProgramFilesDir` 会改变 MSI 的默认安装盘；
   要强制指定位置需显式传 `INSTALLFOLDER`（用短路径如 `C:\PROGRA~1\PowerShell\` 规避空格与尾部反斜杠的引号陷阱）。
5. **App Execution Alias**：`%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` 若是损坏的 0 字节重解析点，
   会导致 `spawn UNKNOWN`；安装真实 PowerShell 7 使其进入机器 PATH 即可恢复正常解析。
