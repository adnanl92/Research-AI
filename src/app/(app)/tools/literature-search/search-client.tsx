"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  ExternalLink,
  Loader2,
  LockOpen,
  RotateCcw,
  Search,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SaveButton } from "@/components/save-button";

interface Paper {
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  doi: string | null;
  url: string | null;
  source: string;
  citationCount: number | null;
  venue: string | null;
  isOpenAccess: boolean;
  oaUrl: string | null;
  tldr?: string | null;
}

type Stance = "yes" | "no" | "mixed" | "unclear";

interface Consensus {
  counts: Record<Stance, number>;
  weighted: Record<Stance, number>;
  stances: { paper: number; stance: Stance }[];
}

interface SearchResponse {
  answer: string;
  papers: Paper[];
  consensus: Consensus | null;
  fromCache: boolean;
}

const STANCE_STYLES: Record<Stance, { label: string; bar: string }> = {
  yes: { label: "Yes", bar: "bg-emerald-500" },
  no: { label: "No", bar: "bg-rose-500" },
  mixed: { label: "Mixed", bar: "bg-amber-400" },
  unclear: { label: "Unclear", bar: "bg-neutral-300 dark:bg-neutral-600" },
};

/** Render the answer text with [n] markers as links to the source list. */
function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) return <span key={i}>{part}</span>;
        return (
          <a
            key={i}
            href={`#source-${match[1]}`}
            className="rounded bg-primary/10 px-1 font-medium text-primary hover:bg-primary/20"
          >
            [{match[1]}]
          </a>
        );
      })}
    </div>
  );
}

function toRis(papers: Paper[]): string {
  return papers
    .map((p) => {
      const lines = ["TY  - JOUR", `TI  - ${p.title}`];
      for (const a of p.authors) lines.push(`AU  - ${a}`);
      if (p.year) lines.push(`PY  - ${p.year}`);
      if (p.venue) lines.push(`JO  - ${p.venue}`);
      if (p.doi) lines.push(`DO  - ${p.doi}`);
      if (p.url) lines.push(`UR  - ${p.url}`);
      if (p.abstract) lines.push(`AB  - ${p.abstract.slice(0, 2000)}`);
      lines.push("ER  - ");
      return lines.join("\n");
    })
    .join("\n");
}

export function SearchClient() {
  const [query, setQuery] = useState("");
  const [yearMin, setYearMin] = useState<string>("any");
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [biomedical, setBiomedical] = useState(false);
  const [yesNoMode, setYesNoMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const lastQueryRef = useRef("");

  async function runSearch(searchQuery: string) {
    if (searchQuery.trim().length < 3) {
      setError("Enter at least 3 characters.");
      return;
    }
    lastQueryRef.current = searchQuery;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/tools/literature-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          filters: {
            ...(yearMin !== "any" ? { yearMin: Number(yearMin) } : {}),
            openAccessOnly,
            biomedical,
          },
          ...(yesNoMode ? { yesNoMode: true } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Search failed");
      setResult(data as SearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function downloadRis() {
    if (!result) return;
    const blob = new Blob([toRis(result.papers)], {
      type: "application/x-research-info-systems",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "literature-search.ris";
    link.click();
    URL.revokeObjectURL(url);
  }

  const weightedTotal = result?.consensus
    ? Object.values(result.consensus.weighted).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Literature Search
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask a research question. The answer is generated only from papers
          retrieved live from OpenAlex, PubMed, and Semantic Scholar — every
          claim is cited.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="space-y-3"
      >
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "Does mindfulness training reduce burnout in physicians?"'
            className="flex-1"
          />
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
            Search
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Label htmlFor="yearMin" className="text-muted-foreground">
              Published since
            </Label>
            <Select value={yearMin} onValueChange={setYearMin}>
              <SelectTrigger id="yearMin" className="h-8 w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any year</SelectItem>
                <SelectItem value="2020">2020</SelectItem>
                <SelectItem value="2015">2015</SelectItem>
                <SelectItem value="2010">2010</SelectItem>
                <SelectItem value="2000">2000</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="oa"
              checked={openAccessOnly}
              onCheckedChange={setOpenAccessOnly}
            />
            <Label htmlFor="oa">Open access only</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="biomed"
              checked={biomedical}
              onCheckedChange={setBiomedical}
            />
            <Label htmlFor="biomed">Biomedical (PubMed)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="yesno"
              checked={yesNoMode}
              onCheckedChange={setYesNoMode}
            />
            <Label htmlFor="yesno">Yes/No question</Label>
          </div>
        </div>
      </form>

      {loading ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Searching live scholarly databases and composing a grounded
            answer… this can take 15–30 seconds.
          </p>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Search failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => runSearch(lastQueryRef.current || query)}
            >
              <RotateCcw /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <div className="space-y-6">
          {result.consensus && weightedTotal > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Consensus meter{" "}
                  <span className="font-normal text-muted-foreground">
                    (weighted by citations, from {result.papers.length} papers)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex h-4 w-full overflow-hidden rounded-full">
                  {(Object.keys(STANCE_STYLES) as Stance[]).map((stance) => {
                    const pct =
                      (result.consensus!.weighted[stance] / weightedTotal) * 100;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={stance}
                        className={STANCE_STYLES[stance].bar}
                        style={{ width: `${pct}%` }}
                        title={`${STANCE_STYLES[stance].label}: ${pct.toFixed(0)}%`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {(Object.keys(STANCE_STYLES) as Stance[]).map((stance) => (
                    <span key={stance} className="flex items-center gap-1.5">
                      <span
                        className={`size-2.5 rounded-full ${STANCE_STYLES[stance].bar}`}
                      />
                      {STANCE_STYLES[stance].label}:{" "}
                      {weightedTotal > 0
                        ? (
                            (result.consensus!.weighted[stance] / weightedTotal) *
                            100
                          ).toFixed(0)
                        : 0}
                      % ({result.consensus!.counts[stance]} papers)
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
              <CardTitle className="text-base">Answer</CardTitle>
              <div className="flex gap-2">
                <SaveButton
                  toolId="literature-search"
                  title={lastQueryRef.current}
                  content={result.answer}
                  sourceMetadata={{ papers: result.papers }}
                  label="Save this search"
                />
                <Button variant="outline" size="sm" onClick={downloadRis}>
                  <Download /> RIS
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <AnswerText text={result.answer} />
              {result.fromCache ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Paper list served from cache (refreshed every 24h).
                </p>
              ) : null}
            </CardContent>
          </Card>

          {result.papers.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Sources ({result.papers.length})
              </h3>
              {result.papers.map((paper, index) => {
                const stance = result.consensus?.stances.find(
                  (s) => s.paper === index + 1,
                )?.stance;
                return (
                  <Card key={index} id={`source-${index + 1}`} className="scroll-mt-20">
                    <CardContent className="space-y-1.5 pt-4">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-sm font-semibold text-primary">
                          [{index + 1}]
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug">{paper.title}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {paper.authors.slice(0, 5).join(", ")}
                            {paper.authors.length > 5 ? " et al." : ""}
                            {paper.year ? ` · ${paper.year}` : ""}
                            {paper.venue ? ` · ${paper.venue}` : ""}
                            {paper.citationCount != null
                              ? ` · ${paper.citationCount.toLocaleString()} citations`
                              : ""}
                          </p>
                          {paper.tldr ? (
                            <p className="mt-1.5 text-sm">
                              <span className="font-medium">TLDR:</span>{" "}
                              {paper.tldr}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {stance ? (
                              <Badge variant="secondary">
                                Stance: {STANCE_STYLES[stance].label}
                              </Badge>
                            ) : null}
                            {paper.isOpenAccess ? (
                              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                                <LockOpen className="size-3" /> Open access
                              </Badge>
                            ) : null}
                            <Badge variant="outline">{paper.source}</Badge>
                            {paper.url ? (
                              <a
                                href={paper.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              >
                                View <ExternalLink className="size-3" />
                              </a>
                            ) : null}
                            {paper.oaUrl && paper.oaUrl !== paper.url ? (
                              <a
                                href={paper.oaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              >
                                Full text <ExternalLink className="size-3" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
