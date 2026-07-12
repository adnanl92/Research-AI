/**
 * Normalized paper shape shared by every retrieval source.
 * Each source module (openalex, semanticScholar, pubmed) maps its raw API
 * response into this type; merge.ts combines and dedupes them.
 */
export interface Paper {
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  doi: string | null;
  url: string | null;
  source: "openalex" | "semantic-scholar" | "pubmed";
  citationCount: number | null;
  venue: string | null;
  isOpenAccess: boolean;
  oaUrl: string | null;
  /** Semantic Scholar TLDR, attached during merge when DOIs match. */
  tldr?: string | null;
}

export interface SearchFilters {
  yearMin?: number;
  openAccessOnly?: boolean;
  /** Bias retrieval toward PubMed for biomedical queries. */
  biomedical?: boolean;
}
