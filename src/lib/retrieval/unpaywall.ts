import { fetchJson } from "./http";

/**
 * Unpaywall — resolve DOIs to legal open-access PDF links.
 * https://unpaywall.org/products/api
 * Requires UNPAYWALL_EMAIL; silently skipped if unset.
 */

interface UnpaywallResponse {
  is_oa: boolean;
  best_oa_location: { url_for_pdf: string | null; url: string | null } | null;
}

export interface OaResolution {
  isOpenAccess: boolean;
  oaUrl: string | null;
}

export async function resolveOpenAccess(
  doi: string,
): Promise<OaResolution | null> {
  const email = process.env.UNPAYWALL_EMAIL;
  if (!email) return null;

  try {
    const data = await fetchJson<UnpaywallResponse>(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`,
      { timeoutMs: 10_000 },
    );
    return {
      isOpenAccess: data.is_oa,
      oaUrl: data.best_oa_location?.url_for_pdf ?? data.best_oa_location?.url ?? null,
    };
  } catch {
    return null; // best-effort; missing OA info is not an error
  }
}

/** Resolve several DOIs concurrently (bounded), best-effort. */
export async function resolveOpenAccessBatch(
  dois: string[],
): Promise<Map<string, OaResolution>> {
  const result = new Map<string, OaResolution>();
  if (!process.env.UNPAYWALL_EMAIL || dois.length === 0) return result;

  const CONCURRENCY = 5;
  for (let i = 0; i < dois.length; i += CONCURRENCY) {
    const batch = dois.slice(i, i + CONCURRENCY);
    const resolutions = await Promise.all(batch.map(resolveOpenAccess));
    batch.forEach((doi, idx) => {
      const res = resolutions[idx];
      if (res) result.set(doi, res);
    });
  }
  return result;
}
