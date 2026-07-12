import { fetchJson } from "./http";
import type { Paper, SearchFilters } from "./types";

/**
 * PubMed via NCBI E-utilities (ESearch + EFetch) for biomedical queries.
 * https://www.ncbi.nlm.nih.gov/books/NBK25501/
 *
 * NCBI_API_KEY raises the rate limit to 10 req/s (else 3 req/s). We make at
 * most two calls per search, spaced when no key is present.
 */

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function apiKeyParam(): string {
  const key = process.env.NCBI_API_KEY;
  return key ? `&api_key=${encodeURIComponent(key)}` : "";
}

/** Extract the first regex capture group, entity-decoded, or null. */
function extract(block: string, regex: RegExp): string | null {
  const match = block.match(regex);
  if (!match?.[1]) return null;
  return decodeEntities(stripTags(match[1]).trim()) || null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

export async function searchPubMed(
  query: string,
  filters: SearchFilters = {},
  limit = 20,
): Promise<Paper[]> {
  let term = query;
  if (filters.yearMin) {
    term += ` AND ${filters.yearMin}:3000[dp]`;
  }

  // Step 1: ESearch — get PMIDs.
  const search = await fetchJson<{
    esearchresult?: { idlist?: string[] };
  }>(
    `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmode=json&retmax=${limit}&sort=relevance${apiKeyParam()}`,
  );
  const ids = search.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  if (!process.env.NCBI_API_KEY) {
    await new Promise((r) => setTimeout(r, 350)); // stay under 3 req/s
  }

  // Step 2: EFetch — full records (XML) for abstracts.
  const response = await fetch(
    `${EUTILS}/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml&rettype=abstract${apiKeyParam()}`,
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from eutils.ncbi.nlm.nih.gov`);
  }
  const xml = await response.text();

  // Lightweight per-article parsing — enough structure for our Paper type
  // without pulling in an XML dependency.
  const articles = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? [];

  return articles
    .map((block): Paper | null => {
      const title = extract(block, /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
      if (!title) return null;

      const pmid = extract(block, /<PMID[^>]*>(\d+)<\/PMID>/);
      const abstractParts =
        block.match(/<AbstractText[^>]*>[\s\S]*?<\/AbstractText>/g) ?? [];
      const abstract =
        abstractParts
          .map((part) => decodeEntities(stripTags(part)).trim())
          .join(" ")
          .trim() || null;

      const year =
        extract(block, /<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/) ??
        extract(block, /<ArticleDate[^>]*>[\s\S]*?<Year>(\d{4})<\/Year>/);

      const doi = extract(
        block,
        /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/,
      );

      const venue = extract(block, /<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);

      const authorBlocks = block.match(/<Author[ >][\s\S]*?<\/Author>/g) ?? [];
      const authors = authorBlocks
        .map((a) => {
          const last = extract(a, /<LastName>([\s\S]*?)<\/LastName>/);
          const fore = extract(a, /<ForeName>([\s\S]*?)<\/ForeName>/);
          return [fore, last].filter(Boolean).join(" ");
        })
        .filter(Boolean);

      return {
        title,
        authors,
        year: year ? Number(year) : null,
        abstract,
        doi: doi?.toLowerCase() ?? null,
        url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null,
        source: "pubmed",
        citationCount: null, // E-utilities doesn't provide citation counts
        venue,
        isOpenAccess: false, // resolved later via Unpaywall
        oaUrl: null,
      };
    })
    .filter((p): p is Paper => p !== null);
}
