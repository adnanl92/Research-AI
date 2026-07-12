import { fetchJson } from "./http";
import type { Paper, SearchFilters } from "./types";

/**
 * OpenAlex — the primary/default retrieval source.
 * https://docs.openalex.org/api-entities/works
 * Free; the mailto param opts us into the "polite pool" for better rate limits.
 */

interface OpenAlexWork {
  id: string;
  display_name: string | null;
  publication_year: number | null;
  doi: string | null; // full URL form, e.g. https://doi.org/10.1234/abcd
  cited_by_count: number | null;
  abstract_inverted_index: Record<string, number[]> | null;
  authorships: { author: { display_name: string | null } }[] | null;
  primary_location: {
    source: { display_name: string | null } | null;
    landing_page_url: string | null;
  } | null;
  open_access: { is_oa: boolean; oa_url: string | null } | null;
}

interface OpenAlexResponse {
  results: OpenAlexWork[];
}

/** OpenAlex returns abstracts as an inverted index; rebuild the plain text. */
function reconstructAbstract(
  inverted: Record<string, number[]> | null,
): string | null {
  if (!inverted) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) words[pos] = word;
  }
  const text = words.join(" ").trim();
  return text || null;
}

export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  return doi
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .trim() || null;
}

export async function searchOpenAlex(
  query: string,
  filters: SearchFilters = {},
  limit = 25,
): Promise<Paper[]> {
  // OpenAlex treats * and ? as wildcards (and rejects them in stemmed
  // search), so strip them from natural-language questions.
  const sanitizedQuery = query.replace(/[*?]/g, " ").replace(/\s+/g, " ").trim();

  const params = new URLSearchParams({
    search: sanitizedQuery,
    "per-page": String(limit),
    sort: "relevance_score:desc",
  });

  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) params.set("mailto", mailto);

  const filterParts: string[] = [];
  if (filters.yearMin) filterParts.push(`publication_year:>${filters.yearMin - 1}`);
  if (filters.openAccessOnly) filterParts.push("is_oa:true");
  if (filterParts.length) params.set("filter", filterParts.join(","));

  const data = await fetchJson<OpenAlexResponse>(
    `https://api.openalex.org/works?${params.toString()}`,
  );

  return (data.results ?? [])
    .filter((w) => w.display_name)
    .map((w) => ({
      title: w.display_name!,
      authors: (w.authorships ?? [])
        .map((a) => a.author?.display_name)
        .filter((n): n is string => Boolean(n)),
      year: w.publication_year ?? null,
      abstract: reconstructAbstract(w.abstract_inverted_index),
      doi: normalizeDoi(w.doi),
      url:
        w.primary_location?.landing_page_url ??
        (w.doi ? w.doi : w.id),
      source: "openalex" as const,
      citationCount: w.cited_by_count ?? null,
      venue: w.primary_location?.source?.display_name ?? null,
      isOpenAccess: w.open_access?.is_oa ?? false,
      oaUrl: w.open_access?.oa_url ?? null,
    }));
}
