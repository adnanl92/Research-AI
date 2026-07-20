import { NextResponse } from "next/server";
import { z } from "zod";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateCompletion, LLMError } from "@/lib/llm/client";
import { completeToolRun } from "@/lib/tools/log";
import { analysisIds, getAnalysisById } from "@/lib/manuscript-coach/definitions";

export const maxDuration = 120;

const requestSchema = z.object({
  text: z
    .string()
    .min(500, "The manuscript text is too short to analyze.")
    .max(120_000),
  analysisId: z.string().refine((id) => analysisIds.includes(id), {
    message: "Unknown analysis.",
  }),
});

export async function POST(request: Request) {
  const access = await requireToolAccess("manuscript-coach");
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { text, analysisId } = parsed.data;
  const analysis = getAnalysisById(analysisId)!;
  const startedAt = Date.now();

  try {
    const result = await generateCompletion({
      system: analysis.systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the full manuscript text (extracted from the author's file):\n\n${text}`,
        },
      ],
      temperature: 0.3,
      maxTokens: analysis.maxTokens,
    });

    await completeToolRun({
      runId: access.runId,
      // Never the manuscript text itself — the extract route promises the
      // manuscript is not persisted anywhere.
      inputSummary: analysisId,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ markdown: result.text });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : "Analysis failed. Please try again.";
    console.error("manuscript-coach analyze error:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
