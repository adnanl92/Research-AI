import { getCached, makeCacheKey, setCached } from "./cache";
import { searchOpenAlex } from "./openalex";
import { searchPubMed } from "./pubmed";
import { enrichByDois, searchSemanticScholar } from "./semanticScholar";
import { resolveOpenAccessBatch } from "./unpaywall";
import type { Paper, SearchFilters } from "./types";

const MAX_RESULTS = 20;
const CACHE_TTL_HOURS = 24;

/** Normalized title key for dedupe when DOIs are missing. */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
}

/**
 * Merge papers from all sources:
 *  - dedupe by DOI, falling back to normalized-title match
 *  - prefer OpenAlex metadata as the base record
 *  - fill gaps (abstract, venue, OA link) from the duplicate record
 */
function mergePapers(primary: Paper[], secondary: Paper[]): Paper[] {
  const byKey = new Map<string, Paper>();

  const keyFor = (p: Paper) => p.doi ?? `title:${titleKey(p.title)}`;

  for (const paper of primary) {
    byKey.set(keyFor(paper), paper);
  }
  for (const paper of secondary) {
    const key = keyFor(paper);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, paper);
    } else {
      // Fill gaps in the base (primary) record.
      existing.abstract = existing.abstract ?? paper.abstract;
      existing.venue = existing.venue ?? paper.venue;
      existing.year = existing.year ?? paper.year;
      existing.citationCount = existing.citationCount ?? paper.citationCount;
      existing.tldr = existing.tldr ?? paper.tldr;
      if (!existing.oaUrl && paper.oaUrl) {
        existing.oaUrl = paper.oaUrl;
        existing.isOpenAccess = true;
      }
      if (existing.authors.length === 0) existing.authors = paper.authors;
    }
  }
  return Array.from(byKey.values());
}

/**
 * Blended ranking: source relevance order + citation weight.
 * OpenAlex/PubMed return relevance-sorted results, so earlier = more
 * relevant; heavily cited papers get a boost on top.
 */
function rank(papers: Paper[]): Paper[] {
  return papers
    .map((paper, index) => ({
      paper,
      score:
        -index + 1.5 * Math.log10((paper.citationCount ?? 0) + 1),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.paper);
}

export interface SearchResult {
  papers: Paper[];
  fromCache: boolean;
}

/**
 * The full retrieval pipeline for a literature query:
 * cache check → OpenAlex (+ PubMed for biomedical, + Semantic Scholar as
 * fallback) → merge/dedupe → S2 TLDR enrichment → Unpaywall OA resolution →
 * rank → cap at 20 → cache for 24h.
 */
export async function searchLiterature(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchResult> {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");
  const cacheKey = makeCacheKey({ kind: "lit-search", query: normalizedQuery, filters });

  const cached = await getCached<Paper[]>(cacheKey);
  if (cached) return { papers: cached, fromCache: true };

  // Primary: OpenAlex. Secondary: PubMed when biomedical bias is on.
  const [openAlexResult, pubmedResult] = await Promise.allSettled([
    searchOpenAlex(normalizedQuery, filters),
    filters.biomedical
      ? searchPubMed(normalizedQuery, filters)
      : Promise.resolve([] as Paper[]),
  ]);

  const openAlexPapers =
    openAlexResult.status === "fulfilled" ? openAlexResult.value : [];
  const pubmedPapers =
    pubmedResult.status === "fulfilled" ? pubmedResult.value : [];

  let merged = filters.biomedical
    ? mergePapers(pubmedPapers, openAlexPapers) // PubMed metadata preferred for biomedical
    : mergePapers(openAlexPapers, pubmedPapers);

  // If the primary sources came up short, fall back to Semantic Scholar search.
  if (merged.length < 5) {
    try {
      const s2Papers = await searchSemanticScholar(normalizedQuery);
      merged = mergePapers(merged, s2Papers);
    } catch {
      // secondary source; ignore failures
    }
  }

  if (merged.length === 0 && openAlexResult.status === "rejected") {
    // Primary source failed AND nothing else found — surface the error.
    throw new Error(
      "Literature sources are unreachable right now. Please try again shortly.",
    );
  }

  // Enrich with Semantic Scholar TLDRs / citation counts by DOI.
  const dois = merged.map((p) => p.doi).filter((d): d is string => Boolean(d));
  const enrichment = await enrichByDois(dois.slice(0, MAX_RESULTS * 2));
  for (const paper of merged) {
    if (!paper.doi) continue;
    const extra = enrichment.get(paper.doi);
    if (extra) {
      paper.tldr = paper.tldr ?? extra.tldr;
      paper.citationCount = paper.citationCount ?? extra.citationCount;
    }
  }

  let papers = rank(merged).slice(0, MAX_RESULTS);

  // Resolve OA links for the final set via Unpaywall (fills PubMed gaps).
  const unresolved = papers
    .filter((p) => p.doi && !p.oaUrl)
    .map((p) => p.doi!) ;
  const oaMap = await resolveOpenAccessBatch(unresolved);
  papers = papers.map((p) => {
    const oa = p.doi ? oaMap.get(p.doi) : undefined;
    return oa
      ? { ...p, isOpenAccess: p.isOpenAccess || oa.isOpenAccess, oaUrl: p.oaUrl ?? oa.oaUrl }
      : p;
  });

  if (filters.openAccessOnly) {
    papers = papers.filter((p) => p.isOpenAccess);
  }

  await setCached(cacheKey, "merged", papers, CACHE_TTL_HOURS);
  return { papers, fromCache: false };
}
