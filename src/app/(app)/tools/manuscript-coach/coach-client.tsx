"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DisclaimerBanner } from "@/components/disclaimer-banner";
import { DownloadButton } from "@/components/download-button";
import { MarkdownView } from "@/components/markdown-view";
import { SaveButton } from "@/components/save-button";
import { cn } from "@/lib/utils";
import {
  coachSets,
  set2Preview,
  type CoachAnalysis,
} from "@/lib/manuscript-coach/definitions";

interface Manuscript {
  text: string;
  fileName: string;
  wordCount: number;
  truncated: boolean;
}

type RunStatus = "idle" | "running" | "done" | "error";

interface RunState {
  status: RunStatus;
  markdown?: string;
  error?: string;
}

const set1 = coachSets.find((s) => s.id === "set-1")!;
const set2 = coachSets.find((s) => s.id === "set-2")!;

export function CoachClient() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [activeAnalysis, setActiveAnalysis] = useState(set1.analyses[0].id);

  function setRun(id: string, state: RunState) {
    setRuns((prev) => ({ ...prev, [id]: state }));
  }

  async function handleFile(file: File) {
    setUploadError(null);
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/tools/manuscript-coach/extract", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Extraction failed");
      setManuscript({
        text: data.text,
        fileName: data.fileName,
        wordCount: data.wordCount,
        truncated: data.truncated,
      });
      setRuns({});
      setActiveAnalysis(set1.analyses[0].id);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Could not read this file.",
      );
    } finally {
      setExtracting(false);
    }
  }

  function usePastedText() {
    const text = pastedText.trim();
    setManuscript({
      text,
      fileName: "Pasted text",
      wordCount: text.split(/\s+/).filter(Boolean).length,
      truncated: false,
    });
    setRuns({});
    setActiveAnalysis(set1.analyses[0].id);
    setUploadError(null);
  }

  function clearManuscript() {
    setManuscript(null);
    setRuns({});
    setPastedText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function runAnalysis(analysis: CoachAnalysis) {
    if (!manuscript) return;
    setRun(analysis.id, { status: "running" });
    try {
      const response = await fetch("/api/tools/manuscript-coach/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: manuscript.text,
          analysisId: analysis.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Analysis failed");
      setRun(analysis.id, { status: "done", markdown: data.markdown });
    } catch (err) {
      setRun(analysis.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Analysis failed",
      });
    }
  }

  function runAll() {
    // Fire all analyses in parallel; each tab updates independently.
    for (const analysis of set1.analyses) {
      const current = runs[analysis.id];
      if (current?.status === "running" || current?.status === "done") continue;
      void runAnalysis(analysis);
    }
  }

  const anyRunning = set1.analyses.some(
    (a) => runs[a.id]?.status === "running",
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Manuscript Coach
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your manuscript and review it against the editorial standards
          of <em>Telling the Story: The Three Pillars of Effective Scientific
          Communication</em> (Piccirillo, JAMA Otolaryngol Head Neck Surg).
          Each pillar returns a step-by-step diagnostic with targeted revision
          suggestions grounded in your actual text.
        </p>
      </div>

      <DisclaimerBanner>
        The AI is a revision assistant, not an author: it diagnoses and
        suggests, but you are responsible for verifying every suggestion
        against your data, methods, and sources. It will not calculate or
        alter any statistical values. Disclose AI assistance in your Author
        Contributions section per journal policy.
      </DisclaimerBanner>

      {/* ---------- Step 1: manuscript input ---------- */}
      {!manuscript ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1 · Add your manuscript</CardTitle>
            <CardDescription>
              PDF or Word (.docx), up to 15 MB. The file is parsed in memory
              and never stored — only the extracted text stays in your browser,
              and it is sent to the AI backend only when you run an analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload a PDF or Word manuscript"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50",
              )}
            >
              {extracting ? (
                <>
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Extracting text from your manuscript…
                  </p>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Drop your manuscript here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    .pdf or .docx · text-based files only (scanned PDFs are
                    not supported)
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />

            {uploadError ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Could not read the file</AlertTitle>
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            ) : null}

            {!showPaste ? (
              <button
                type="button"
                onClick={() => setShowPaste(true)}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Or paste the manuscript text instead
              </button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={8}
                  placeholder="Paste your full manuscript text here (at least a few paragraphs)…"
                />
                <Button
                  size="sm"
                  onClick={usePastedText}
                  disabled={pastedText.trim().length < 500}
                >
                  <FileText /> Use this text
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-4">
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {manuscript.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                ~{manuscript.wordCount.toLocaleString()} words extracted
                {manuscript.truncated
                  ? " · long manuscript: analysis uses the first ~80,000 characters"
                  : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearManuscript}>
              <X /> Replace
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---------- Step 2: sets and analyses ---------- */}
      {manuscript ? (
        <Tabs defaultValue={set1.id}>
          <TabsList>
            <TabsTrigger value={set1.id}>{set1.label}</TabsTrigger>
            <TabsTrigger value={set2.id}>
              {set2.label}
              <Badge variant="secondary" className="ml-1.5">
                Soon
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={set1.id} className="mt-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-xl text-sm text-muted-foreground">
                {set1.description}
              </p>
              <Button onClick={runAll} disabled={anyRunning}>
                {anyRunning ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                Run all {set1.analyses.length} analyses
              </Button>
            </div>

            <Tabs value={activeAnalysis} onValueChange={setActiveAnalysis}>
              <TabsList className="h-auto flex-wrap">
                {set1.analyses.map((analysis) => {
                  const status = runs[analysis.id]?.status ?? "idle";
                  return (
                    <TabsTrigger key={analysis.id} value={analysis.id}>
                      {status === "running" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : status === "done" ? (
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                      ) : status === "error" ? (
                        <AlertCircle className="size-3.5 text-destructive" />
                      ) : null}
                      {analysis.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {set1.analyses.map((analysis) => {
                const run = runs[analysis.id] ?? { status: "idle" as const };
                return (
                  <TabsContent
                    key={analysis.id}
                    value={analysis.id}
                    className="mt-4"
                  >
                    <Card>
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <CardTitle className="text-base">
                            {analysis.title}
                          </CardTitle>
                          <Badge variant="outline">
                            {analysis.sourcePrompts}
                          </Badge>
                        </div>
                        <CardDescription>{analysis.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {run.status === "idle" ? (
                          <Button onClick={() => runAnalysis(analysis)}>
                            <Play /> Run {analysis.label}
                          </Button>
                        ) : null}

                        {run.status === "running" ? (
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                              Reviewing your manuscript against{" "}
                              {analysis.title}… (~30–60s)
                            </p>
                            <Skeleton className="h-32 w-full" />
                            <Skeleton className="h-24 w-full" />
                          </div>
                        ) : null}

                        {run.status === "error" ? (
                          <Alert variant="destructive">
                            <AlertCircle />
                            <AlertTitle>Analysis failed</AlertTitle>
                            <AlertDescription className="flex flex-col gap-3">
                              <span>{run.error}</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-fit"
                                onClick={() => runAnalysis(analysis)}
                              >
                                <RotateCcw /> Retry
                              </Button>
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {run.status === "done" && run.markdown ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                              <SaveButton
                                toolId="manuscript-coach"
                                title={`${analysis.title} — ${manuscript.fileName}`}
                                content={run.markdown}
                              />
                              <DownloadButton
                                content={run.markdown}
                                filename={`${analysis.id}-review.md`}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => runAnalysis(analysis)}
                              >
                                <RotateCcw /> Re-run
                              </Button>
                            </div>
                            <MarkdownView>{run.markdown}</MarkdownView>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>

          <TabsContent value={set2.id} className="mt-4 space-y-4">
            <p className="max-w-2xl text-sm text-muted-foreground">
              {set2.description}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {set2Preview.map((item) => (
                <Card key={item.title} className="opacity-75">
                  <CardHeader>
                    <CardTitle className="text-sm">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Set 2 analyses address language and framing only — the AI will
              never recalculate, verify, or generate statistical values. If
              effect sizes or 95% CIs are missing from your manuscript,
              calculate them with statistical software first.
            </p>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
