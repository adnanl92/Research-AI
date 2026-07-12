"use client";

import { useState } from "react";
import {
  AlertCircle,
  CircleHelp,
  Gavel,
  ListChecks,
  Loader2,
  NotebookPen,
  RotateCcw,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SaveButton } from "@/components/save-button";

interface Summary {
  attendees: string[];
  keyDecisions: string[];
  actionItems: { item: string; owner: string | null }[];
  openQuestions: string[];
}

function summaryToMarkdown(s: Summary): string {
  return [
    "## Attendees",
    s.attendees.length ? s.attendees.map((a) => `- ${a}`).join("\n") : "- (none identified)",
    "\n## Key Decisions",
    s.keyDecisions.length ? s.keyDecisions.map((d) => `- ${d}`).join("\n") : "- (none)",
    "\n## Action Items",
    s.actionItems.length
      ? s.actionItems.map((a) => `- ${a.item}${a.owner ? ` — **${a.owner}**` : ""}`).join("\n")
      : "- (none)",
    "\n## Open Questions",
    s.openQuestions.length ? s.openQuestions.map((q) => `- ${q}`).join("\n") : "- (none)",
  ].join("\n");
}

export function NotesClient() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const response = await fetch("/api/tools/meeting-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Summarization failed");
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarization failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Meeting Notes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste raw meeting notes or a transcript and get a structured
          summary: decisions, action items with owners, and open questions.
          Do not paste PHI or other sensitive personal information.
        </p>
      </div>

      <div className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Paste raw notes or a transcript here…"
        />
        <Button onClick={run} disabled={loading || text.trim().length < 50}>
          {loading ? <Loader2 className="animate-spin" /> : <NotebookPen />}
          Summarize
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Summarizing… (~15-30s)</p>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Summarization failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" className="w-fit" onClick={run}>
              <RotateCcw /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {summary ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <SaveButton
              toolId="meeting-notes"
              title={`Meeting summary: ${text.slice(0, 60)}`}
              content={summaryToMarkdown(summary)}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Users className="size-4" /> Attendees
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.attendees.length === 0 ? (
                <p className="text-sm text-muted-foreground">None identified in the notes.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {summary.attendees.map((a) => (
                    <Badge key={a} variant="secondary">
                      {a}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Gavel className="size-4" /> Key decisions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.keyDecisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions recorded.</p>
              ) : (
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {summary.keyDecisions.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <ListChecks className="size-4" /> Action items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.actionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No action items recorded.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {summary.actionItems.map((a, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <span>{a.item}</span>
                      {a.owner ? (
                        <Badge variant="outline" className="shrink-0">
                          {a.owner}
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CircleHelp className="size-4" /> Open questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.openQuestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open questions.</p>
              ) : (
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {summary.openQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
