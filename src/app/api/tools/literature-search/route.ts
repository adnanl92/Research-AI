import { NextResponse } from "next/server";
import { z } from "zod";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateCompletion, generateStructured, LLMError } from "@/lib/llm/client";
import { searchLiterature } from "@/lib/retrieval/merge";
import type { Paper } from "@/lib/retrieval/types";
import { logToolRun } from "@/lib/tools/log";

export const maxDuration = 120;

const requestSchema = z.object({
  query: z.string().min(3, "Query is too short").max(500),
  filters: z
    .object({
      yearMin: z.number().int().min(1900).max(2100).optional(),
      openAccessOnly: z.boolean().optional(),
      biomedical: z.boolean().optional(),
    })
    .optional(),
  /** Force the yes/no consensus meter on (auto-detected otherwise). */
  yesNoMode: z.boolean().optional(),
});

const stanceSchema = z.object({
  stances: z.array(
    z.object({
      paper: z.number().int(),
      stance: z.enum(["yes", "no", "mixed", "unclear"]),
    }),
  ),
});

function looksLikeYesNoQuestion(query: string): boolean {
  return /^(does|do|is|are|can|could|should|will|would|did|has|have|was|were)\b/i.test(
    query.trim(),
  );
}

/** Serialize the retrieved papers into a numbered evidence block. */
function papersToEvidence(papers: Paper[]): string {
  return papers
    .map((p, i) => {
      const authors =
        p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : "");
      const abstract = p.abstract
        ? p.abstract.slice(0, 1500)
        : (p.tldr ?? "No abstract available.");
      return `[${i + 1}] "${p.title}" — ${authors || "Unknown authors"} (${p.year ?? "n.d."}), ${p.venue ?? "unknown venue"}. Citations: ${p.citationCount ?? "unknown"}.
Abstract: ${abstract}`;
    })
    .join("\n\n");
}

const ANSWER_SYSTEM = `You are a research literature assistant for university faculty. You answer research questions using ONLY the numbered papers provided — never outside knowledge, never invented citations.

Rules:
- Every factual claim must cite its source with bracketed markers like [1] or [2][5] that map to the numbered paper list.
- Only cite numbers that exist in the provided list.
- If the retrieved papers do not address the question (or only partially), say explicitly: "The retrieved literature does not address this" (or which part it does not address). Never fabricate findings.
- Be measured and academic: distinguish strong evidence (multiple large studies) from weak (single small study), and note contradictions between papers.
- Structure: a 1-2 sentence direct answer first, then 2-4 short paragraphs of supporting evidence, then limitations of the retrieved evidence.`;

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

  const { query, filters = {}, yesNoMode } = parsed.data;
  const startedAt = Date.now();

  try {
    // 1. Retrieve (cache-backed).
    const { papers, fromCache } = await searchLiterature(query, filters);

    if (papers.length === 0) {
      return NextResponse.json({
        answer:
          "No papers were found for this query in OpenAlex, PubMed, or Semantic Scholar. Try broadening the search terms or removing filters.",
        papers: [],
        consensus: null,
        fromCache,
      });
    }

    const evidence = papersToEvidence(papers);
    const isYesNo = yesNoMode ?? looksLikeYesNoQuestion(query);

    // 2. Grounded answer + (optionally) per-paper stance classification.
    const answerPromise = generateCompletion({
      system: ANSWER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Question: ${query}\n\nRetrieved papers:\n\n${evidence}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1500,
    });

    const consensusPromise = isYesNo
      ? generateStructured({
          system:
            "You classify whether each numbered paper's abstract supports a yes or no answer to the research question. Judge ONLY from the provided abstracts. Use \"mixed\" for papers with evidence both ways, \"unclear\" when the abstract does not address the question.",
          messages: [
            {
              role: "user",
              content: `Question: ${query}\n\nPapers:\n\n${evidence}\n\nClassify every paper 1 through ${papers.length}.`,
            },
          ],
          schema: stanceSchema,
          schemaDescription: `{"stances": [{"paper": <number 1-${papers.length}>, "stance": "yes" | "no" | "mixed" | "unclear"}, ...]}`,
          maxTokens: 1200,
        }).catch(() => null) // consensus is best-effort; never block the answer
      : Promise.resolve(null);

    const [answer, consensusRaw] = await Promise.all([
      answerPromise,
      consensusPromise,
    ]);

    // 3. Build the consensus meter, weighted by citation count.
    let consensus: {
      counts: Record<"yes" | "no" | "mixed" | "unclear", number>;
      weighted: Record<"yes" | "no" | "mixed" | "unclear", number>;
      stances: { paper: number; stance: "yes" | "no" | "mixed" | "unclear" }[];
    } | null = null;

    if (consensusRaw) {
      const counts = { yes: 0, no: 0, mixed: 0, unclear: 0 };
      const weighted = { yes: 0, no: 0, mixed: 0, unclear: 0 };
      const stances = consensusRaw.data.stances.filter(
        (s) => s.paper >= 1 && s.paper <= papers.length,
      );
      for (const s of stances) {
        counts[s.stance] += 1;
        // Weight by log-scaled citation count so a 10k-citation paper counts
        // more than an uncited one without completely drowning it out.
        const cites = papers[s.paper - 1]?.citationCount ?? 0;
        weighted[s.stance] += 1 + Math.log10(cites + 1);
      }
      consensus = { counts, weighted, stances };
    }

    await logToolRun({
      userId: access.userId,
      toolId: "literature-search",
      inputSummary: query,
      inputTokens:
        answer.usage.promptTokens + (consensusRaw?.usage.promptTokens ?? 0),
      outputTokens:
        answer.usage.completionTokens +
        (consensusRaw?.usage.completionTokens ?? 0),
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      answer: answer.text,
      papers,
      consensus,
      fromCache,
    });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Literature search failed.";
    console.error("literature-search error:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
