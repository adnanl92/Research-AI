/**
 * Minimal fetch wrapper for external scholarly APIs: per-request timeout and
 * simple exponential backoff (max 2 retries) on 429/5xx/network errors.
 */
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export async function fetchJson<T>(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // 500ms, then 1500ms
      await new Promise((r) => setTimeout(r, 500 * 3 ** (attempt - 1)));
    }
    try {
      const response = await fetch(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status} from ${new URL(url).host}`);
        continue; // retryable
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      // AbortSignal timeout and network errors are retryable; anything we
      // threw ourselves for a non-retryable status is not.
      if (error instanceof Error && error.message.startsWith("HTTP ")) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Request to ${new URL(url).host} failed`);
}
