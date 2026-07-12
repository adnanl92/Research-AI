"use client";

import { useState } from "react";
import { AlertCircle, ExternalLink, Loader2, RotateCcw, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DisclaimerBanner } from "@/components/disclaimer-banner";
import { DownloadButton } from "@/components/download-button";
import { MarkdownView } from "@/components/markdown-view";
import { SaveButton } from "@/components/save-button";

interface Paper {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  citationCount: number | null;
  url: string | null;
  isOpenAccess: boolean;
}

export function GrantClient() {
  // --- Aims drafter state ---
  const [idea, setIdea] = useState("");
  const [aimsDraft, setAimsDraft] = useState<string | null>(null);
  const [aimsLoading, setAimsLoading] = useState(false);
  const [aimsError, setAimsError] = useState<string | null>(null);

  // --- Related work state ---
  const [topic, setTopic] = useState("");
  const [related, setRelated] = useState<{ summary: string; papers: Paper[] } | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);

  async function generateAims() {
    setAimsLoading(true);
    setAimsError(null);
    setAimsDraft(null);
    try {
      const response = await fetch("/api/tools/grant-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "aims", idea }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Generation failed");
      setAimsDraft(data.draft);
    } catch (err) {
      setAimsError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAimsLoading(false);
    }
  }

  async function findRelated() {
    setRelatedLoading(true);
    setRelatedError(null);
    setRelated(null);
    try {
      const response = await fetch("/api/tools/grant-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "related-work", topic }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Search failed");
      setRelated(data);
    } catch (err) {
      setRelatedError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setRelatedLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Grant Editor</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft a Specific Aims page from a rough idea, and see how your
          proposal fits into the published landscape.
        </p>
      </div>

      <DisclaimerBanner>
        AI-assisted draft — review and substantially revise before submission.
        Federal funders increasingly restrict AI-generated grant content;
        verify current NIH/NSF policy before submitting.
      </DisclaimerBanner>

      <Tabs defaultValue="aims">
        <TabsList>
          <TabsTrigger value="aims">Specific Aims Drafter</TabsTrigger>
          <TabsTrigger value="related">Related Work Finder</TabsTrigger>
        </TabsList>

        <TabsContent value="aims" className="space-y-4">
          <Textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={8}
            placeholder="Paste your rough idea, background notes, or an elevator pitch (at least a few sentences). The draft is generated purely from what you write here — nothing is invented."
          />
          <Button onClick={generateAims} disabled={aimsLoading || idea.trim().length < 30}>
            {aimsLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Draft Specific Aims
          </Button>

          {aimsLoading ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Drafting… (~20-40s)</p>
              <Skeleton className="h-40 w-full" />
            </div>
          ) : null}

          {aimsError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Draft failed</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <span>{aimsError}</span>
                <Button variant="outline" size="sm" className="w-fit" onClick={generateAims}>
                  <RotateCcw /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {aimsDraft ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Specific Aims draft</CardTitle>
                <div className="flex gap-2">
                  <SaveButton
                    toolId="grant-editor"
                    title={`Aims: ${idea.slice(0, 80)}`}
                    content={aimsDraft}
                  />
                  <DownloadButton content={aimsDraft} filename="specific-aims-draft.md" />
                </div>
              </CardHeader>
              <CardContent>
                <MarkdownView>{aimsDraft}</MarkdownView>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="related" className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              findRelated();
            }}
            className="flex gap-2"
          >
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder='Proposal topic, e.g. "machine learning for early sepsis prediction in the ICU"'
              className="flex-1"
            />
            <Button type="submit" disabled={relatedLoading || topic.trim().length < 5}>
              {relatedLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Map the landscape
            </Button>
          </form>

          {relatedLoading ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Retrieving related work and composing a grounded summary… (~20-40s)
              </p>
              <Skeleton className="h-40 w-full" />
            </div>
          ) : null}

          {relatedError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Search failed</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <span>{relatedError}</span>
                <Button variant="outline" size="sm" className="w-fit" onClick={findRelated}>
                  <RotateCcw /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {related ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Research landscape</CardTitle>
                  <SaveButton
                    toolId="grant-editor"
                    title={`Landscape: ${topic.slice(0, 80)}`}
                    content={related.summary}
                    sourceMetadata={{ papers: related.papers }}
                  />
                </CardHeader>
                <CardContent>
                  <MarkdownView>{related.summary}</MarkdownView>
                </CardContent>
              </Card>

              {related.papers.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Retrieved papers ({related.papers.length})
                  </h3>
                  {related.papers.map((paper, index) => (
                    <Card key={index}>
                      <CardContent className="flex items-start gap-2 pt-4">
                        <span className="mt-0.5 shrink-0 text-sm font-semibold text-primary">
                          [{index + 1}]
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{paper.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {paper.authors.slice(0, 4).join(", ")}
                            {paper.authors.length > 4 ? " et al." : ""}
                            {paper.year ? ` · ${paper.year}` : ""}
                            {paper.venue ? ` · ${paper.venue}` : ""}
                            {paper.citationCount != null
                              ? ` · ${paper.citationCount.toLocaleString()} citations`
                              : ""}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2">
                            {paper.isOpenAccess ? (
                              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                                Open access
                              </Badge>
                            ) : null}
                            {paper.url ? (
                              <a
                                href={paper.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                View <ExternalLink className="size-3" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </section>
              ) : null}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
