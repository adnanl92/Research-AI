import { NextResponse } from "next/server";
import { z } from "zod";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateStructured, LLMError } from "@/lib/llm/client";
import { logToolRun } from "@/lib/tools/log";

export const maxDuration = 120;

const requestSchema = z.object({
  text: z.string().min(100, "Paste at least a paragraph to critique").max(50_000),
  persona: z.enum(["grant-reviewer", "irb-member", "peer-reviewer"]),
});

const critiqueSchema = z.object({
  overallImpression: z.string(),
  concerns: z.array(
    z.object({
      severity: z.enum(["major", "minor"]),
      concern: z.string(),
      suggestedFix: z.string(),
    }),
  ),
});

const PERSONAS: Record<string, string> = {
  "grant-reviewer": `You are a skeptical but fair NIH study-section reviewer. You care about: significance, innovation, rigor of approach, feasibility, investigator fit, unstated assumptions, overclaiming, and vague methods. You have seen a thousand proposals and know every way they fail.`,
  "irb-member": `You are an experienced IRB board member. You care about: risk/benefit balance, vulnerable populations, consent adequacy, privacy and data protection, recruitment ethics, coercion/undue influence, and regulatory completeness. You flag anything a board would question.`,
  "peer-reviewer": `You are a rigorous journal peer reviewer (Reviewer 2, but constructive). You care about: clarity of contribution, methodological soundness, statistical validity, overinterpretation of results, missing limitations, reproducibility, and writing clarity.`,
};

export async function POST(request: Request) {
  const access = await requireToolAccess();
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

  const { text, persona } = parsed.data;
  const startedAt = Date.now();

  try {
    const result = await generateStructured({
      system: `${PERSONAS[persona]}

Critique the submitted draft constructively — this is pre-submission review to help the author improve, not a rejection. Identify 4-10 concrete concerns, each with severity ("major" = would sink the submission or requires substantive rework, "minor" = fixable weakness or polish) and a specific, actionable suggested fix. Base every concern on the actual text; quote or reference specific passages where possible. Start with a 2-3 sentence overall impression that is honest about strengths and weaknesses.`,
      messages: [{ role: "user", content: text }],
      schema: critiqueSchema,
      schemaDescription: `{"overallImpression": "...", "concerns": [{"severity": "major" | "minor", "concern": "...", "suggestedFix": "..."}, ...]}`,
      temperature: 0.4,
      maxTokens: 3000,
    });

    await logToolRun({
      userId: access.userId,
      toolId: "critique",
      inputSummary: `${persona}: ${text}`,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ critique: result.data });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Request failed.";
    console.error("critique error:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
