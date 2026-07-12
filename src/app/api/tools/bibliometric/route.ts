import { NextResponse } from "next/server";
import { z } from "zod";

import { requireToolAccess } from "@/lib/tools/guard";
import { generateCompletion } from "@/lib/llm/client";
import { getCached, makeCacheKey, setCached } from "@/lib/retrieval/cache";
import { fetchJson } from "@/lib/retrieval/http";
import { logToolRun } from "@/lib/tools/log";

export const maxDuration = 120;

const requestSchema = z.object({
  input: z.string().min(3, "Enter an author name, author ID, or DOI").max(300),
});

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

function mailtoParam(): string {
  const mailto = process.env.OPENALEX_MAILTO;
  return mailto ? `&mailto=${encodeURIComponent(mailto)}` : "";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function authorFromOpenAlex(a: any): Omit<AuthorSnapshot, "topVenues" | "topCoauthors"> {
  return {
    kind: "author",
    name: a.display_name,
    openAlexId: String(a.id).replace("https://openalex.org/", ""),
    orcid: a.orcid ? String(a.orcid).replace("https://orcid.org/", "") : null,
    institution: a.last_known_institutions?.[0]?.display_name ?? null,
    worksCount: a.works_count ?? 0,
    citedByCount: a.cited_by_count ?? 0,
    hIndex: a.summary_stats?.h_index ?? null,
    i10Index: a.summary_stats?.i10_index ?? null,
    countsByYear: (a.counts_by_year ?? [])
      .map((c: any) => ({
        year: c.year,
        citations: c.cited_by_count ?? 0,
        works: c.works_count ?? 0,
      }))
      .sort((x: YearCount, y: YearCount) => x.year - y.year),
  };
}

async function fetchAuthorSnapshot(authorUrlSegment: string): Promise<AuthorSnapshot> {
  const author: any = await fetchJson(
    `https://api.openalex.org/authors/${authorUrlSegment}?${mailtoParam().slice(1)}`,
  );
  const base = authorFromOpenAlex(author);
  const id = base.openAlexId;

  // Top venues and co-authors via OpenAlex group_by aggregations (fast, 2 calls).
  const [venues, coauthors] = await Promise.all([
    fetchJson<any>(
      `https://api.openalex.org/works?filter=author.id:${id}&group_by=primary_location.source.id&per-page=10${mailtoParam()}`,
    ).catch(() => null),
    fetchJson<any>(
      `https://api.openalex.org/works?filter=author.id:${id}&group_by=authorships.author.id&per-page=12${mailtoParam()}`,
    ).catch(() => null),
  ]);

  return {
    ...base,
    topVenues: (venues?.group_by ?? [])
      .filter((g: any) => g.key_display_name)
      .slice(0, 8)
      .map((g: any) => ({ name: g.key_display_name, count: g.count })),
    topCoauthors: (coauthors?.group_by ?? [])
      .filter((g: any) => g.key_display_name && g.key_display_name !== base.name)
      .slice(0, 8)
      .map((g: any) => ({ name: g.key_display_name, count: g.count })),
  };
}

async function fetchPaperSnapshot(doi: string): Promise<PaperSnapshot> {
  const work: any = await fetchJson(
    `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?${mailtoParam().slice(1)}`,
  );
  return {
    kind: "paper",
    title: work.display_name,
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name ?? null,
    authors: (work.authorships ?? [])
      .map((a: any) => a.author?.display_name)
      .filter(Boolean)
      .slice(0, 12),
    citationCount: work.cited_by_count ?? 0,
    countsByYear: (work.counts_by_year ?? [])
      .map((c: any) => ({ year: c.year, citations: c.cited_by_count ?? 0 }))
      .sort((x: YearCount, y: YearCount) => x.year - y.year),
    doi,
    isOpenAccess: work.open_access?.is_oa ?? false,
    url: work.doi ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function classifyInput(raw: string): { type: "doi" | "openalex" | "orcid" | "name"; value: string } {
  const input = raw.trim();
  const doiMatch = input.match(/(?:doi\.org\/|doi:)?(10\.\d{4,}\/\S+)/i);
  if (doiMatch) return { type: "doi", value: doiMatch[1].toLowerCase() };
  const openAlexMatch = input.match(/(?:openalex\.org\/)?(A\d{6,})/i);
  if (openAlexMatch) return { type: "openalex", value: openAlexMatch[1].toUpperCase() };
  const orcidMatch = input.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/);
  if (orcidMatch) return { type: "orcid", value: orcidMatch[1] };
  return { type: "name", value: input };
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
  const classified = classifyInput(parsed.data.input);
  const cacheKey = makeCacheKey({ kind: "bibliometric", ...classified });

  try {
    let snapshot = await getCached<Snapshot>(cacheKey);

    if (!snapshot) {
      if (classified.type === "doi") {
        snapshot = await fetchPaperSnapshot(classified.value);
      } else if (classified.type === "openalex") {
        snapshot = await fetchAuthorSnapshot(classified.value);
      } else if (classified.type === "orcid") {
        snapshot = await fetchAuthorSnapshot(`orcid:${classified.value}`);
      } else {
        // Name search: take the top-relevance author match.
        const results: { results?: { id: string }[] } = await fetchJson(
          `https://api.openalex.org/authors?search=${encodeURIComponent(classified.value)}&per-page=1${mailtoParam()}`,
        );
        const first = results.results?.[0];
        if (!first) {
          return NextResponse.json(
            { error: `No author found matching "${classified.value}".` },
            { status: 404 },
          );
        }
        snapshot = await fetchAuthorSnapshot(
          String(first.id).replace("https://openalex.org/", ""),
        );
      }
      await setCached(cacheKey, "openalex", snapshot, 24);
    }

    // One short LLM call for a plain-language trend summary, grounded
    // strictly in the fetched numbers. Best-effort — never blocks the data.
    let summary: string | null = null;
    let usage = { promptTokens: 0, completionTokens: 0 };
    try {
      const numbers =
        snapshot.kind === "author"
          ? `Author: ${snapshot.name}. Works: ${snapshot.worksCount}. Total citations: ${snapshot.citedByCount}. h-index: ${snapshot.hIndex}. Citations by year: ${snapshot.countsByYear.map((c) => `${c.year}:${c.citations}`).join(", ")}.`
          : `Paper: "${snapshot.title}" (${snapshot.year}). Total citations: ${snapshot.citationCount}. Citations by year: ${snapshot.countsByYear.map((c) => `${c.year}:${c.citations}`).join(", ")}.`;
      const result = await generateCompletion({
        system:
          "Write a 2-3 sentence plain-language summary of the citation trend, grounded STRICTLY in the numbers provided. No praise, no speculation beyond the data, no invented facts.",
        messages: [{ role: "user", content: numbers }],
        maxTokens: 200,
      });
      summary = result.text;
      usage = result.usage;
    } catch {
      // data still renders without the summary
    }

    await logToolRun({
      userId: access.userId,
      toolId: "bibliometric",
      inputSummary: parsed.data.input,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({ snapshot, summary });
  } catch (error) {
    console.error("bibliometric error:", error);
    const message =
      error instanceof Error && error.message.includes("HTTP 404")
        ? "Nothing found for that input — check the DOI/ID or try a different spelling."
        : "Bibliometric lookup failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
