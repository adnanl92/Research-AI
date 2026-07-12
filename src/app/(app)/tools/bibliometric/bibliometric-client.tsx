"use client";

import { useState } from "react";
import { AlertCircle, BarChart3, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveButton } from "@/components/save-button";

interface YearCount {
  year: number;
  citations: number;
  works?: number;
}

interface AuthorSnapshot {
  kind: "author";
  name: string;
  openAlexId: string;
  orcid: string | null;
  institution: string | null;
  worksCount: number;
  citedByCount: number;
  hIndex: number | null;
  i10Index: number | null;
  countsByYear: YearCount[];
  topVenues: { name: string; count: number }[];
  topCoauthors: { name: string; count: number }[];
}

interface PaperSnapshot {
  kind: "paper";
  title: string;
  year: number | null;
  venue: string | null;
  authors: string[];
  citationCount: number;
  countsByYear: YearCount[];
  doi: string;
  isOpenAccess: boolean;
  url: string | null;
}

type Snapshot = AuthorSnapshot | PaperSnapshot;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export function BibliometricClient() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setSnapshot(null);
    setSummary(null);
    try {
      const response = await fetch("/api/tools/bibliometric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Lookup failed");
      setSnapshot(data.snapshot);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Bibliometric Snapshot
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Citation counts, h-index, publication timeline, and top venues from
          OpenAlex. Enter an author name, an ORCID or OpenAlex author ID, or a
          paper DOI.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "Jennifer Doudna", 0000-0001-9161-999X, or 10.1126/science.1225829'
          className="flex-1"
        />
        <Button type="submit" disabled={loading || input.trim().length < 3}>
          {loading ? <Loader2 className="animate-spin" /> : <BarChart3 />}
          Look up
        </Button>
      </form>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Lookup failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" className="w-fit" onClick={run}>
              <RotateCcw /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot ? (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base">
                  {snapshot.kind === "author" ? snapshot.name : snapshot.title}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {snapshot.kind === "author"
                    ? (snapshot.institution ?? "Institution unknown") +
                      (snapshot.orcid ? ` · ORCID ${snapshot.orcid}` : "")
                    : [
                        snapshot.authors.slice(0, 5).join(", ") +
                          (snapshot.authors.length > 5 ? " et al." : ""),
                        snapshot.year,
                        snapshot.venue,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
              </div>
              <SaveButton
                toolId="bibliometric"
                title={`Snapshot: ${snapshot.kind === "author" ? snapshot.name : snapshot.title}`}
                content={JSON.stringify(snapshot, null, 2)}
              />
            </CardHeader>
            {snapshot.kind === "paper" ? (
              <CardContent className="flex items-center gap-2 pt-0">
                {snapshot.isOpenAccess ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    Open access
                  </Badge>
                ) : null}
                {snapshot.url ? (
                  <a
                    href={snapshot.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    {snapshot.doi} <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </CardContent>
            ) : null}
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {snapshot.kind === "author" ? (
              <>
                <StatCard label="Publications" value={snapshot.worksCount.toLocaleString()} />
                <StatCard label="Total citations" value={snapshot.citedByCount.toLocaleString()} />
                <StatCard label="h-index" value={snapshot.hIndex ?? "—"} />
                <StatCard label="i10-index" value={snapshot.i10Index ?? "—"} />
              </>
            ) : (
              <>
                <StatCard label="Total citations" value={snapshot.citationCount.toLocaleString()} />
                <StatCard label="Published" value={snapshot.year ?? "—"} />
                <StatCard label="Authors" value={snapshot.authors.length} />
                <StatCard
                  label="Citations (last year)"
                  value={
                    snapshot.countsByYear.at(-1)?.citations.toLocaleString() ?? "—"
                  }
                />
              </>
            )}
          </div>

          {summary ? (
            <Card>
              <CardContent className="pt-4 text-sm leading-relaxed">
                <span className="font-medium">Trend summary:</span> {summary}
              </CardContent>
            </Card>
          ) : null}

          {snapshot.countsByYear.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Citations by year
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={snapshot.countsByYear}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" fontSize={12} tickLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} width={48} />
                      <Tooltip
                        cursor={{ fill: "var(--muted)" }}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="citations"
                        fill="var(--primary)"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {snapshot.kind === "author" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Top venues</CardTitle>
                </CardHeader>
                <CardContent>
                  {snapshot.topVenues.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No venue data.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {snapshot.topVenues.map((v) => (
                        <li key={v.name} className="flex justify-between gap-2">
                          <span className="truncate">{v.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {v.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Frequent co-authors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {snapshot.topCoauthors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No co-author data.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {snapshot.topCoauthors.map((c) => (
                        <li key={c.name} className="flex justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {c.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
