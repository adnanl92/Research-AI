import { db } from "@/lib/db";

const INPUT_SUMMARY_MAX = 100;

/**
 * Write-only usage log for every AI tool invocation. Deliberately minimal:
 * never store full prompts or outputs here — only a truncated input summary
 * (first ~100 chars, no PHI expected anywhere in this app), token counts,
 * and latency. Also powers the per-user rate limiter.
 */
export async function logToolRun(params: {
  userId: string;
  toolId: string;
  inputSummary: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}): Promise<void> {
  try {
    await db.toolRun.create({
      data: {
        userId: params.userId,
        toolId: params.toolId,
        inputSummary: params.inputSummary.slice(0, INPUT_SUMMARY_MAX),
        inputTokens: params.inputTokens ?? 0,
        outputTokens: params.outputTokens ?? 0,
        latencyMs: params.latencyMs ?? 0,
      },
    });
  } catch (error) {
    // Logging must never break a tool response.
    console.error("Failed to write ToolRun log:", error);
  }
}
