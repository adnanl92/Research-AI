import { NextResponse } from "next/server";
import { z } from "zod";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateCompletion, LLMError } from "@/lib/llm/client";
import { completeToolRun } from "@/lib/tools/log";

export const maxDuration = 120;

const requestSchema = z.object({
  description: z.string().min(15, "Describe the process in a sentence or two").max(10_000),
  diagramType: z.enum(["auto", "flowchart", "sequence", "state"]).default("auto"),
});

const SYSTEM = `You convert plain-language descriptions of processes, workflows, and study designs into Mermaid.js diagram code.

Rules:
- Output ONLY raw Mermaid code. No markdown fences, no explanation, no title line outside the diagram.
- Use valid Mermaid syntax that renders in mermaid v11.
- Quote node labels that contain parentheses, commas, or special characters: A["Label (detail)"].
- Prefer clear, short node labels; put detail in edge labels where helpful.
- For flowcharts use "flowchart TD" (or LR when the flow is wide and shallow).
- For sequence diagrams use "sequenceDiagram" with named participants.
- For state diagrams use "stateDiagram-v2".
- Keep diagrams readable: at most ~20 nodes; group with subgraphs when it helps.`;

export async function POST(request: Request) {
  const access = await requireToolAccess("diagram-builder");
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

  const { description, diagramType } = parsed.data;
  const startedAt = Date.now();

  const typeInstruction =
    diagramType === "auto"
      ? "Pick the diagram type (flowchart, sequence, or state) that best fits the description."
      : `Use a ${diagramType} diagram.`;

  try {
    const result = await generateCompletion({
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `${typeInstruction}\n\nDescription:\n${description}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1500,
    });

    // Strip accidental markdown fences.
    const mermaid = result.text
      .trim()
      .replace(/^```(?:mermaid)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    await completeToolRun({
      runId: access.runId,
      inputSummary: description,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ mermaid });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : "Diagram generation failed. Please try again.";
    console.error("diagram-builder error:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
