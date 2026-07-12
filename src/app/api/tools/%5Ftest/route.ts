import { NextResponse } from "next/server";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateCompletion, LLMError } from "@/lib/llm/client";
import { logToolRun } from "@/lib/tools/log";

/**
 * Connectivity test for the Azure AI Foundry endpoint.
 * GET /api/tools/_test (must be signed in) — returns a real completion
 * plus token usage, proving env vars and the deployment work end-to-end.
 */
export async function GET() {
  const access = await requireToolAccess();
  if (access instanceof NextResponse) return access;

  const startedAt = Date.now();
  try {
    const result = await generateCompletion({
      system:
        "You are a connectivity test. Reply with one short sentence confirming you are reachable, and name no specific model or vendor.",
      messages: [{ role: "user", content: "Say hello to confirm the connection works." }],
      maxTokens: 50,
    });

    const latencyMs = Date.now() - startedAt;
    await logToolRun({
      userId: access.userId,
      toolId: "_test",
      inputSummary: "Azure connectivity test",
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      latencyMs,
    });

    return NextResponse.json({
      ok: true,
      completion: result.text,
      usage: result.usage,
      latencyMs,
    });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : "Unexpected error calling the LLM backend.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
