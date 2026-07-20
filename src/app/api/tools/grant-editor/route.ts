import { NextResponse } from "next/server";
import { z } from "zod";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateCompletion, LLMError } from "@/lib/llm/client";
import { searchLiterature } from "@/lib/retrieval/merge";
import type { Paper } from "@/lib/retrieval/types";
import { logToolRun } from "@/lib/tools/log";

export const maxDuration = 120;

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("aims"),
    idea: z.string().min(30, "Describe your idea in at least a few sentences").max(20_000),
  }),
  z.object({
    mode: z.literal("related-work"),
    topic: z.string().min(5, "Topic is too short").max(500),
  }),
]);

const AIMS_SYSTEM = `You are an experienced grant-writing coach helping a university faculty member draft a Specific Aims page (NIH-style, adaptable to NSF). Work ONLY from the researcher's own description — do not invent preliminary data, citations, or collaborator names.

Produce a structured first draft with these headed sections:
## Background & Significance  (2-3 sentences establishing the problem's importance)
## The Gap  (what is unknown or unsolved — sharp and specific)
## Long-Term Goal & Objective  (one sentence each)
## Central Hypothesis  (if the input supports one; otherwise a guiding research question)
## Specific Aims  (Aim 1, Aim 2, Aim 3 — each with a one-line title, a working hypothesis or goal, and a 2-3 sentence approach sketch)
## Expected Outcomes & Impact  (payoff if aims succeed)

Where the researcher's input lacks information a real aims page needs, insert a bracketed placeholder like [ADD: preliminary data supporting feasibility] rather than inventing content. This is a first-draft aid — keep the tone confident but factual.`;

const RELATED_WORK_SYSTEM = `You are a research-landscape analyst. Using ONLY the numbered papers provided, write a "how your proposal fits into the landscape" briefing for a faculty member planning a grant on the given topic.

Rules:
- Cite with bracketed markers [n] mapping to the numbered list; never cite numbers not in the list.
- Structure: ## What is already established (2-3 paragraphs) · ## Active directions and recent momentum · ## Apparent gaps your proposal could fill (bullet list, each tied to what the retrieved papers do NOT cover).
- If the retrieved papers poorly cover the topic, say so explicitly rather than stretching them.`;

function papersToEvidence(papers: Paper[]): string {
  return papers
    .map((p, i) => {
      const authors =
        p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : "");
      return `[${i + 1}] "${p.title}" — ${authors || "Unknown"} (${p.year ?? "n.d."}), ${p.venue ?? "unknown venue"}. Citations: ${p.citationCount ?? "unknown"}.
Abstract: ${p.abstract?.slice(0, 1200) ?? p.tldr ?? "No abstract available."}`;
    })
    .join("\n\n");
}

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

  const startedAt = Date.now();

  try {
    if (parsed.data.mode === "aims") {
      const result = await generateCompletion({
        system: AIMS_SYSTEM,
        messages: [{ role: "user", content: parsed.data.idea }],
        temperature: 0.4,
        maxTokens: 3000,
      });

      await logToolRun({
        userId: access.userId,
        toolId: "grant-editor",
        inputSummary: `aims: ${parsed.data.idea}`,
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        latencyMs: Date.now() - startedAt,
      });

      return NextResponse.json({ draft: result.text });
    }

    // related-work mode: retrieve first, then generate.
    const { papers } = await searchLiterature(parsed.data.topic, {});
    if (papers.length === 0) {
      return NextResponse.json({
        summary:
          "No related papers were found for this topic. Try different terminology.",
        papers: [],
      });
    }

    const result = await generateCompletion({
      system: RELATED_WORK_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Proposal topic: ${parsed.data.topic}\n\nRetrieved papers:\n\n${papersToEvidence(papers)}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 2000,
    });

    await logToolRun({
      userId: access.userId,
      toolId: "grant-editor",
      inputSummary: `related-work: ${parsed.data.topic}`,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ summary: result.text, papers });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : "Request failed. Please try again.";
    console.error("grant-editor error:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
