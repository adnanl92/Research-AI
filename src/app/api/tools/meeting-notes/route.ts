import { NextResponse } from "next/server";
import { z } from "zod";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateStructured, LLMError } from "@/lib/llm/client";
import { completeToolRun } from "@/lib/tools/log";

export const maxDuration = 120;

const requestSchema = z.object({
  text: z.string().min(50, "Paste at least a few lines of notes").max(100_000),
});

const summarySchema = z.object({
  attendees: z.array(z.string()),
  keyDecisions: z.array(z.string()),
  actionItems: z.array(
    z.object({
      item: z.string(),
      owner: z.string().nullable(),
    }),
  ),
  openQuestions: z.array(z.string()),
});

export async function POST(request: Request) {
  const access = await requireToolAccess("meeting-notes");
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
    const result = await generateStructured({
      system: `You summarize raw meeting notes/transcripts into a structured record. Extract ONLY what is actually in the notes — never invent attendees, decisions, or owners.
- attendees: people explicitly mentioned as present (empty array if none are identifiable).
- keyDecisions: decisions that were actually made (not topics merely discussed).
- actionItems: concrete follow-ups; set owner to the named person or null if unassigned.
- openQuestions: unresolved questions or deferred topics.`,
      messages: [{ role: "user", content: parsed.data.text }],
      schema: summarySchema,
      schemaDescription: `{"attendees": ["..."], "keyDecisions": ["..."], "actionItems": [{"item": "...", "owner": "name or null"}], "openQuestions": ["..."]}`,
      temperature: 0.2,
      maxTokens: 2500,
    });

    await completeToolRun({
      runId: access.runId,
      // Meeting notes routinely name people and decisions — log a neutral
      // label, never the notes themselves.
      inputSummary: "meeting-notes run",
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ summary: result.data });
  } catch (error) {
    const message =
      error instanceof LLMError
        ? error.message
        : "Summarization failed. Please try again.";
    console.error("meeting-notes error:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
