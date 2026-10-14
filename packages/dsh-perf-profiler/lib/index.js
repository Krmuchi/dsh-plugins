// dsh-perf-profiler — DeepSeek Harness 性能剖析插件（零依赖，纯 Node ESM）
//
// 挂钩点（均为 Host 侧公开事件契约）：
//   tools/execute        waterfall — 包住每次工具派发，测总耗时
//   tools/result         emit      — 记录归一化后的最终结果大小 / 错误
//   llm/stream           waterfall — 包住每次流式模型请求，测总耗时与首 token 延迟
//   approval/request     waterfall — 包住每次审批问答，测人等待时长
//
// 输出：
//   <outputDir>/perf.jsonl   每行一条记录，供离线分析
//   <outputDir>/summary.json 按 kind:subject 聚合的计数 / 平均 / 最大耗时
//
// 设计原则：任何情况下都不干扰正常执行——只测量、只追加、失败静默。

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const name = "dsh-perf-profiler";
export const version = "0.1.0";

export function apply(ctx, config = {}) {
  const outputDir = config.outputDir || join(homedir(), ".dsh", "perf");
  mkdirSync(outputDir, { recursive: true });
  const logPath = join(outputDir, "perf.jsonl");
  const summaryPath = join(outputDir, "summary.json");

  const aggregate = new Map();
  let summaryDirty = 0;

  function record(kind, subject, fields = {}) {
    const entry = { ts: new Date().toISOString(), kind, subject, ...fields };
    try {
      appendFileSync(logPath, JSON.stringify(entry) + "\n");
    } catch {
      // 日志写失败绝不抛出
    }
    const key = `${kind}:${subject}`;
    const agg = aggregate.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
    agg.count += 1;
    if (typeof fields.durationMs === "number" && Number.isFinite(fields.durationMs)) {
      agg.totalMs += fields.durationMs;
      agg.maxMs = Math.max(agg.maxMs, fields.durationMs);
    }
    aggregate.set(key, agg);
    if (++summaryDirty >= 10) flushSummary();
  }

  function flushSummary() {
    summaryDirty = 0;
    const entries = {};
    for (const [key, agg] of aggregate) {
      entries[key] = {
        count: agg.count,
        totalMs: Math.round(agg.totalMs),
        avgMs: agg.count ? Math.round(agg.totalMs / agg.count) : 0,
        maxMs: Math.round(agg.maxMs),
      };
    }
    try {
      writeFileSync(summaryPath, JSON.stringify({ updatedAt: new Date().toISOString(), log: logPath, entries }, null, 2));
    } catch {
      // 同上
    }
  }

  // ---- 字段提取（不同构建下字段名可能有差异，全部防御式取值） ----

  const pick = (...values) => values.find((v) => typeof v === "string" && v.length > 0);

  const toolNameOf = (exec) =>
    pick(
      exec?.name,
      exec?.toolName,
      exec?.tool?.name,
      exec?.definition?.name,
      exec?.tool?.definition?.name,
    ) || "(unknown-tool)";

  const sessionIdOf = (exec) =>
    pick(exec?.sessionId, exec?.agent?.sessionId, exec?.agent?.id, exec?.session?.id) || undefined;

  const modelOf = (options) =>
    pick(options?.model, options?.config?.model, options?.request?.model, options?.callConfig?.model) || "(unknown-model)";

  const safeSize = (value) => {
    if (value == null) return 0;
    try {
      return JSON.stringify(value).length;
    } catch {
      return -1;
    }
  };

  // ---- tools/execute：每次工具派发的总耗时（含重试 / 审批内联等待） ----

  ctx.on("tools/execute", async (exec, next) => {
    const started = Date.now();
    let failure;
    try {
      const result = await next();
      return result;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      record("tool.execute", toolNameOf(exec), {
        sessionId: sessionIdOf(exec),
        callId: exec?.callId,
        durationMs: Date.now() - started,
        failed: failure ? String(failure?.message ?? failure) : undefined,
      });
    }
  });

  // ---- tools/result：归一化后的最终结果（错误标记与体积） ----

  ctx.on("tools/result", (exec, result) => {
    record("tool.result", toolNameOf(exec), {
      sessionId: sessionIdOf(exec),
      callId: exec?.callId,
      isError: Boolean(result?.isError ?? result?.error),
      resultSize: safeSize(result?.content ?? result),
    });
  });

  // ---- llm/stream：流式模型请求总耗时 + 首 token 延迟 ----

  ctx.on("llm/stream", async function* (options, next) {
    const started = Date.now();
    let firstChunkAt = null;
    let chunks = 0;
    try {
      for await (const chunk of next()) {
        if (firstChunkAt === null) firstChunkAt = Date.now();
        chunks += 1;
        yield chunk;
      }
    } finally {
      record("llm.stream", modelOf(options), {
        durationMs: Date.now() - started,
        ttftMs: firstChunkAt === null ? undefined : firstChunkAt - started,
        chunks,
      });
    }
  });

  // ---- approval/request：每次审批让人确认时等了多久 ----

  ctx.on("approval/request", async (req, next) => {
    const started = Date.now();
    try {
      return await next();
    } finally {
      record("approval.request", pick(req?.tool, req?.name, req?.kind) || "(approval)", {
        sessionId: sessionIdOf(req?.exec ?? req),
        durationMs: Date.now() - started,
      });
    }
  });

  // 卸载前落一次汇总。两处刻意的写法：
  //  1. 用 ctx.effect(() => () => ...) 注册清理，这是 DSH 生态验证过的写法；
  //  2. 不使用 ctx.setInterval —— timer 是服务，未声明 inject: ['timer'] 时
  //     Cordis 取属性会直接抛 `cannot get property "timer" without inject`，
  //     导致整个插件激活失败。
  ctx.effect(() => () => {
    try {
      flushSummary();
    } catch {
      /* ignore */
    }
  });

  flushSummary();
  try {
    // ctx.logger 是属性对象（不是函数），不同构建下形态可能不同，故双形态防御。
    const logger = typeof ctx.logger === "function" ? ctx.logger("dsh-perf-profiler") : ctx.logger;
    logger?.info?.(`profiling -> ${logPath}`);
  } catch {
    // logger 不可用时静默，绝不影响加载
  }
}
