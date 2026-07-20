import { db } from "@/lib/db";

const INPUT_SUMMARY_MAX = 100;

/**
 * Fills in the ToolRun row that requireToolAccess reserved. Deliberately
 * minimal: never store full prompts, outputs, or sensitive user text here —
 * only a short neutral summary (≤100 chars), token counts, and latency.
 * The row itself also powers the per-user rate limiter.
 */
export async function completeToolRun(params: {
  runId: string;
  inputSummary: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}): Promise<void> {
  try {
    await db.toolRun.update({
      where: { id: params.runId },
      data: {
        inputSummary: params.inputSummary.slice(0, INPUT_SUMMARY_MAX),
        inputTokens: params.inputTokens ?? 0,
        outputTokens: params.outputTokens ?? 0,
        latencyMs: params.latencyMs ?? 0,
      },
    });
  } catch (error) {
    // Logging must never break a tool response.
    console.error("Failed to update ToolRun log:", error);
  }
}
