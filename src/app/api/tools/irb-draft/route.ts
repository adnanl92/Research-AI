import { NextResponse } from "next/server";
import { z } from "zod";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateCompletion, LLMError } from "@/lib/llm/client";
import { completeToolRun } from "@/lib/tools/log";

export const maxDuration = 120;

const requestSchema = z.object({
  title: z.string().min(5, "Study title is required").max(300),
  studyType: z.enum([
    "observational",
    "interventional",
    "retrospective-chart-review",
    "survey",
    "qualitative-interviews",
    "secondary-data-analysis",
    "other",
  ]),
  population: z.string().min(10, "Describe the population and recruitment").max(10_000),
  procedures: z.string().min(10, "Describe the study procedures").max(10_000),
  risks: z.string().min(10, "Describe risks and safeguards").max(10_000),
  dataHandling: z.string().min(10, "Describe data handling").max(10_000),
});

const IRB_SYSTEM = `You are drafting a first-draft IRB protocol document for a university researcher, using ONLY the structured study information they provide. Do not invent details — where required information is missing, insert a bracketed placeholder like [ADD: retention period for identifiable data].

Produce a document with exactly these headed sections, in this order:
## Purpose
## Background
## Study Design
## Subject Population
## Recruitment & Consent
## Procedures
## Risks & Benefits
## Data Management
## Privacy & Confidentiality

Write in formal protocol prose (third person, present/future tense). Match the study type's conventions (e.g., a retrospective chart review should discuss waiver of consent where appropriate — flagged as a suggestion, not a determination). This draft does NOT replace institutional IRB review or legal/compliance guidance, and the document should not claim any approval status.`;

export async function POST(request: Request) {
  const access = await requireToolAccess("irb-draft");
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

  const { title, studyType, population, procedures, risks, dataHandling } =
    parsed.data;
  const startedAt = Date.now();

  try {
    const result = await generateCompletion({
      system: IRB_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Study Title: ${title}
Study Type: ${studyType.replace(/-/g, " ")}

Population & Recruitment:
${population}

Procedures:
${procedures}

Risks & Safeguards:
${risks}

Data Handling:
${dataHandling}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 4000,
    });

    await completeToolRun({
      runId: access.runId,
      inputSummary: title,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ draft: result.text });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : "Draft generation failed. Please try again.";
    console.error("irb-draft error:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
