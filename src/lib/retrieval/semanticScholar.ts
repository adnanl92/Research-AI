import { fetchJson } from "./http";
import { normalizeDoi } from "./openalex";
import type { Paper } from "./types";

/**
 * Semantic Scholar Graph API — used to enrich OpenAlex results with TLDRs
 * and citation data where DOIs match (and as a secondary search source).
 * https://api.semanticscholar.org/api-docs/graph
 *
 * With SEMANTIC_SCHOLAR_API_KEY: normal usage. Without a key: conservative
 * rate limiting (1 request per 3 seconds, enforced module-wide).
 */

const FIELDS =
  "title,abstract,year,externalIds,tldr,citationCount,venue,authors,isOpenAccess,openAccessPdf,url";

interface S2Paper {
  title: string | null;
  abstract: string | null;
  year: number | null;
  url: string | null;
  venue: string | null;
  citationCount: number | null;
  isOpenAccess: boolean | null;
  openAccessPdf: { url: string } | null;
  externalIds: { DOI?: string } | null;
  tldr: { text: string | null } | null;
  authors: { name: string | null }[] | null;
}

let lastUnauthenticatedCall = 0;
const UNAUTHENTICATED_INTERVAL_MS = 3_000;

async function throttleIfUnauthenticated(): Promise<Record<string, string>> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  if (apiKey) return { "x-api-key": apiKey };

  const now = Date.now();
  const wait = lastUnauthenticatedCall + UNAUTHENTICATED_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastUnauthenticatedCall = Date.now();
  return {};
}

function toPaper(p: S2Paper): Paper | null {
  if (!p.title) return null;
  return {
    title: p.title,
    authors: (p.authors ?? [])
      .map((a) => a.name)
      .filter((n): n is string => Boolean(n)),
    year: p.year ?? null,
    abstract: p.abstract ?? null,
    doi: normalizeDoi(p.externalIds?.DOI),
    url: p.url,
    source: "semantic-scholar",
    citationCount: p.citationCount ?? null,
    venue: p.venue || null,
    isOpenAccess: p.isOpenAccess ?? false,
    oaUrl: p.openAccessPdf?.url ?? null,
    tldr: p.tldr?.text ?? null,
  };
}

export async function searchSemanticScholar(
  query: string,
  limit = 20,
): Promise<Paper[]> {
  const headers = await throttleIfUnauthenticated();
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: FIELDS,
  });
  const data = await fetchJson<{ data?: S2Paper[] }>(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
    { headers },
  );
  return (data.data ?? [])
    .map(toPaper)
    .filter((p): p is Paper => p !== null);
}

export interface S2Enrichment {
  tldr: string | null;
  citationCount: number | null;
}

/**
 * Look up papers by DOI (batched) to attach TLDR + citation counts to
 * OpenAlex results. Failures return an empty map — enrichment is best-effort.
 */
export async function enrichByDois(
  dois: string[],
): Promise<Map<string, S2Enrichment>> {
  const result = new Map<string, S2Enrichment>();
  if (dois.length === 0) return result;

  try {
    const headers = await throttleIfUnauthenticated();
    const params = new URLSearchParams({ fields: "externalIds,tldr,citationCount" });
    const response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/batch?${params.toString()}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: dois.map((d) => `DOI:${d}`) }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) return result;

    const papers = (await response.json()) as (S2Paper | null)[];
    for (const p of papers) {
      const doi = normalizeDoi(p?.externalIds?.DOI);
      if (p && doi) {
        result.set(doi, {
          tldr: p.tldr?.text ?? null,
          citationCount: p.citationCount ?? null,
        });
      }
    }
  } catch {
    // best-effort enrichment; ignore failures
  }
  return result;
}
