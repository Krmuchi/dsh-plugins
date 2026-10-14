# dsh-shell-rescue

当内置 `pwsh` 工具在**进程创建前**失败（`spawn UNKNOWN` / `windows-acl-run CreateProcessAsUserW` /
sandbox backend 不可用）时，透明改用 `node:child_process` 直连执行同一条命令，
并构造与内置 pwsh **逐字段一致**的 foreground 结果通过原生 oneOf 校验 ——
Agent 感知不到差别，省掉每次失败后 15~90s 的模型恢复往返。

## 可执行文件解析

不硬编码 `C:\Program Files`，按以下顺序探测，适配 **Program Files 被重定向 / 自定义安装目录 /
PATH 未刷新** 的机器：

1. `config.executable`（`cordis.patch.yml` 热配置，改完即生效）
2. 环境变量 `DSH_SHELL_RESCUE_PWSH`
3. 标准目录：`%ProgramW6432%` / `%ProgramFiles%` / `C:\Program Files` 下的 `PowerShell\7\pwsh.exe`、`7-preview`
4. `PATH` 扫描 `pwsh.exe`（`System32\WindowsPowerShell` 只有 `powershell.exe`，天然跳过 5.1）
5. **注册表安装位置探测**：`HKLM\SOFTWARE\Microsoft\PowerShellCore\InstallerProperties\InstallFolder`
   与 `InstalledVersions\*\InstallDir` —— 解决"刚装完 PATH 未刷新"的窗口期，无需重启 DSH 立即生效
6. 兜底：`System32\WindowsPowerShell\v1.0\powershell.exe`（5.1）→ PATH 上的 `powershell.exe`

## 行为与边界

- 只匹配"进程从未被创建"的错误签名 → 命令绝不会重复执行
- 只对 `pwsh` 生效；后台调用（`run_in_background`）不兜底
- 审批拒绝（策略拒绝升权等）不命中签名，照原样放行 —— 不触碰审批语义
- 兜底自身失败 → 原样返回原始失败，绝不更糟
- UTF-8 归一化前缀防 GBK 乱码；超时/中止杀整棵进程树
- 诊断留痕：每次兜底 append 一行到 `~/.dsh/perf/rescue-debug.jsonl`（含实际使用的可执行文件与结果）
- 已知差异：直连不注入 `$env:DSH_*` 托管变量（与 `dsh-pwsh-direct` 一致）

## 安装

```
link:<本仓库路径>/packages/dsh-shell-rescue
```

（plugin_manager install_bundle，安装即激活，无需重启。）

## 配置

```yaml
- id: dsh-shell-rescue
  name: dsh-shell-rescue
  config:
    executable: C:/Program Files/PowerShell/7/pwsh.exe
```

## 什么时候需要它

在 Windows 上，`pwsh` 可能被解析到**损坏的 App Execution Alias**
（`%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe`，0 字节重解析点）而无法创建进程。
安装真正的 PowerShell 7 后解析会恢复正常，本插件则作为兜底保险存在 ——
原生通道正常时它不会介入（不产生任何额外开销）。

## 实测（作者机器）

| 阶段 | 兜底使用的可执行文件 | 说明 |
| --- | --- | --- |
| 未装 PowerShell 7 | `System32\WindowsPowerShell\v1.0\powershell.exe`（5.1） | 直连通道可用但语法受限 |
| 装 PowerShell 7 后 | `C:\Program Files\PowerShell\7\pwsh.exe`（7.6.6） | 注册表探测命中，无需重启即升级 |
| 重启 DSH 后 | 无新兜底记录 | 内置工具已原生解析真身，本插件转入休眠 |

> **Windows 提示**：若注册表 `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\ProgramFilesDir`
> 被改写（例如指向其它盘），MSI 会跟着把"Program Files"装到那里；需要标准 C 盘位置时，
> 安装请显式传 `INSTALLFOLDER=C:\PROGRA~1\PowerShell\`（用短路径规避空格引号陷阱）。

## License

MIT
