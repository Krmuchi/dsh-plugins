// dsh-shell-rescue — DSH 透明 shell 兜底插件（可移植解析版）
//
// 与 v2 的区别只在可执行文件解析：不再硬编码 C:\Program Files，而是多路探测，
// 适配 Program Files 被重定向 / 用户自定义安装目录 / PATH 未刷新的场景：
//   1. config.executable（可选，cordis.patch.yml 热配置）
//   2. pwsh 环境变量覆盖（DSH_SHELL_RESCUE_PWSH）
//   3. 标准目录：%ProgramFiles%\PowerShell\7\pwsh.exe、7-preview
//   4. PATH 扫描 pwsh.exe（System32\WindowsPowerShell 只有 powershell.exe，天然跳过 5.1）
//   5. 注册表安装位置探测（HKLM\SOFTWARE\Microsoft\PowerShellCore\InstallerProperties）
//      —— 解决"装完 PATH 未刷新"的窗口期，无需重启 DSH 立即生效
//   6. 兜底：System32 Windows PowerShell 5.1 → PATH 上的 powershell.exe
//
// 其余机制与安全边界同 v2：只兜"进程创建前失败"（命令未执行、无重复副作用）、
// 只对 pwsh 生效、run_in_background 不兜底、不触碰审批、零服务依赖。

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SPAWN_FAILURE_PATTERNS = [
  /spawn (UNKNOWN|EPERM|ENOENT|EACCES|EAGAIN)/,
  /windows-acl-run/i,
  /CreateProcessAsUserW/,
  /no sandbox backend is usable/i,
  /refusing to run the command unconfined/i,
];

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const OUTPUT_TAIL_CAP = 512_000;

function debugLog(entry) {
  try {
    appendFileSync(join(homedir(), ".dsh", "perf", "rescue-debug.jsonl"), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    /* 诊断日志绝不影响执行 */
  }
}

function looksLikePreExecutionSpawnFailure(result) {
  if (!result || result.isError !== true) return false;
  let haystack;
  try {
    haystack = JSON.stringify(result);
  } catch {
    return false;
  }
  if (!haystack) return false;
  return SPAWN_FAILURE_PATTERNS.some((re) => re.test(haystack));
}

/** 注册表安装位置探测（带缓存；路径失效时允许重新探测）。 */
let registryProbe;
function probeRegistryInstall() {
  if (registryProbe !== undefined && registryProbe !== null && existsSync(registryProbe)) return registryProbe;
  try {
    const result = spawnSync(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\PowerShellCore\\InstallerProperties", "/v", "InstallLocation"],
      { encoding: "utf8", windowsHide: true },
    );
    if (result.status === 0 && typeof result.stdout === "string") {
      const match = result.stdout.match(/InstallLocation\s+REG_SZ\s+(.+)/);
      if (match) {
        registryProbe = join(match[1].trim(), "pwsh.exe");
        if (existsSync(registryProbe)) return registryProbe;
      }
    }
    // 回退：InstallFolder + 7\
    const fallback = spawnSync(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\PowerShellCore\\InstallerProperties", "/v", "InstallFolder"],
      { encoding: "utf8", windowsHide: true },
    );
    if (fallback.status === 0 && typeof fallback.stdout === "string") {
      const match = fallback.stdout.match(/InstallFolder\s+REG_SZ\s+(.+)/);
      if (match) {
        registryProbe = join(match[1].trim(), "7", "pwsh.exe");
        if (existsSync(registryProbe)) return registryProbe;
      }
    }
  } catch {
    /* 探测失败静默 */
  }
  registryProbe = null;
  return undefined;
}

function pathPwshCandidates() {
  const out = [];
  const raw = process.env.Path ?? process.env.PATH ?? "";
  for (const dir of raw.split(";")) {
    const trimmed = dir.trim();
    if (trimmed === "") continue;
    out.push(join(trimmed, "pwsh.exe"));
  }
  return out;
}

function resolveExecutable(config) {
  const candidates = [];
  const override = config?.executable;
  if (typeof override === "string" && override.trim() !== "") candidates.push(override.trim());
  const envOverride = process.env.DSH_SHELL_RESCUE_PWSH;
  if (typeof envOverride === "string" && envOverride.trim() !== "") candidates.push(envOverride.trim());

  const programFiles = [process.env.ProgramW6432, process.env.ProgramFiles, "C:\\Program Files"].filter(Boolean);
  for (const root of programFiles) {
    candidates.push(join(root, "PowerShell", "7", "pwsh.exe"));
    candidates.push(join(root, "PowerShell", "7-preview", "pwsh.exe"));
  }
  candidates.push(...pathPwshCandidates());

  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }

  const fromRegistry = probeRegistryInstall();
  if (fromRegistry !== undefined) return fromRegistry;

  const system32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    if (existsSync(system32)) return system32;
  } catch {
    /* ignore */
  }
  return "powershell.exe";
}

const tail = (text) =>
  text.length > OUTPUT_TAIL_CAP ? { text: text.slice(-OUTPUT_TAIL_CAP), truncated: true } : { text, truncated: false };

/** 与内置 renderPwshResult（无沙箱升权场景）逐行一致的模型侧文本。 */
function renderPwsh(value) {
  let body = value.stdout.text;
  const err = value.stderr.text;
  if (err.length > 0) {
    if (body.length > 0 && !body.endsWith("\n")) body += "\n";
    body += `[stderr]\n${err}`;
  }
  if (body.length === 0) body = "(no output)";
  const markers = [];
  if (value.timedOut) markers.push(`[timed out after ${value.timeoutMs}ms]`);
  if (value.stopped !== undefined) markers.push(`[stopped: ${value.stopped}]`);
  if (value.signal !== null) markers.push(`[killed by signal: ${value.signal}]`);
  else if (value.exitCode !== 0) markers.push(`[exit code: ${value.exitCode}]`);
  if (markers.length === 0) return body;
  if (!body.endsWith("\n")) body += "\n";
  return body + markers.join("\n");
}

function runDirect(command, { workdir, timeoutMs, signal, executable }) {
  return new Promise((resolve) => {
    const wrapped =
      "try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch {}; " +
      command;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;

    let child;
    try {
      child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", wrapped], {
        cwd: workdir,
        env: { ...process.env },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ spawnFailed: true, message: String(error?.message ?? error) });
      return;
    }

    const killTree = () => {
      if (child.pid === undefined) return;
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
      } catch {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      }
    };

    const onAbort = () => {
      aborted = true;
      killTree();
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const append = (slot, chunk) => {
      const combined = slot + chunk;
      return combined.length > OUTPUT_TAIL_CAP * 2 ? combined.slice(-OUTPUT_TAIL_CAP * 2) : combined;
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });

    const finish = (code, sig) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener?.("abort", onAbort);
      if (aborted) {
        resolve({ aborted: true });
        return;
      }
      // Windows 强杀约定：无 signal 时以 exit 1 结算
      const exitCode = code === null ? (sig ? null : timedOut ? 1 : null) : code;
      resolve({
        value: {
          kind: "foreground",
          exitCode,
          signal: sig ?? null,
          timedOut,
          aborted: false,
          timeoutMs,
          stdout: tail(stdout),
          stderr: tail(stderr),
        },
      });
    };

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener?.("abort", onAbort);
      resolve({ spawnFailed: true, message: String(error?.message ?? error) });
    });
    child.on("close", (code, sig) => finish(code, sig));
  });
}

export const name = "dsh-shell-rescue";

export function apply(ctx, config = {}) {
  ctx.on("tools/execute", async (exec, next) => {
    let result;
    let thrown;
    try {
      result = await next();
    } catch (error) {
      thrown = error;
    }

    const candidate = thrown ?? result;
    if (exec?.name !== "pwsh" || !looksLikePreExecutionSpawnFailure(candidate)) {
      if (thrown) throw thrown;
      return result;
    }

    const args = exec.arguments ?? {};
    if (args.run_in_background === true || typeof args.command !== "string" || args.command.trim() === "") {
      if (thrown) throw thrown;
      return result;
    }

    let timeoutMs = Number(args.timeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = DEFAULT_TIMEOUT_MS;
    timeoutMs = Math.min(Math.floor(timeoutMs), MAX_TIMEOUT_MS);

    const headerCwd = exec.agent?.session?.header?.cwd;
    let workdir = args.workdir;
    if (workdir === undefined) workdir = headerCwd;
    else if (headerCwd !== undefined && !isAbsolutePath(workdir)) workdir = join(headerCwd, workdir);

    const executable = resolveExecutable(config);
    debugLog({ event: "rescue.begin", callId: exec.callId, executable });

    const outcome = await runDirect(args.command, { workdir, timeoutMs, signal: exec.signal, executable });
    if (outcome.aborted) throw new Error("tool call aborted");
    if (outcome.spawnFailed) {
      debugLog({ event: "rescue.spawn-failed", message: outcome.message, executable });
      if (thrown) throw thrown;
      return result;
    }

    const value = outcome.value;
    debugLog({ event: "rescue.value", executable, value });
    return {
      isError: false,
      value,
      content: [{ type: "text", text: renderPwsh(value) }],
      meta: { rescuedBy: "dsh-shell-rescue", executable },
    };
  });
}

function isAbsolutePath(p) {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\") || p.startsWith("/");
}
