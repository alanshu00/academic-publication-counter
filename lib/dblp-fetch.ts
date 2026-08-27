const DBLP_HOSTS = [
  "https://dblp.org",
  "https://dblp.uni-trier.de",
  "https://dblp.dagstuhl.de",
] as const;

const FALLBACK_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
const HOST_TIMEOUT_MS = 8_000;
const MAX_RETRY_WAIT_MS = 2_000;

export interface DblpFetchResult {
  response: Response;
  host: string;
}

export interface DblpAttemptDetails {
  host: string;
  url: string;
  status?: number;
  statusText?: string;
  elapsedMs: number;
  retryAfter?: string | null;
  contentType?: string | null;
  errorName?: string;
  errorMessage?: string;
  errorCode?: string;
  causeName?: string;
  causeMessage?: string;
  causeCode?: string;
}

export class DblpUpstreamError extends Error {
  readonly attempts: DblpAttemptDetails[];

  constructor(message: string, attempts: DblpAttemptDetails[]) {
    super(message);
    this.name = "DblpUpstreamError";
    this.attempts = attempts;
  }
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownError", errorMessage: String(error) };
  }
  const codedError = error as Error & { code?: unknown; cause?: unknown };
  const cause = codedError.cause;
  const codedCause = cause instanceof Error
    ? cause as Error & { code?: unknown }
    : undefined;
  return {
    errorName: error.name,
    errorMessage: error.message,
    ...(codedError.code !== undefined && { errorCode: String(codedError.code) }),
    ...(codedCause && {
      causeName: codedCause.name,
      causeMessage: codedCause.message,
      ...(codedCause.code !== undefined && { causeCode: String(codedCause.code) }),
    }),
  };
}

function retryDelayMs(value: string | null): number {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1_000, 0), MAX_RETRY_WAIT_MS);
  }
  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return 1_000;
  return Math.min(Math.max(retryAt - Date.now(), 0), MAX_RETRY_WAIT_MS);
}

async function wait(milliseconds: number) {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = options.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const timer = setTimeout(() => controller.abort(), HOST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function fetchDblpWithFallback(
  path: string,
  options: RequestInit = {},
): Promise<DblpFetchResult> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError("DBLP path must be a root-relative path");
  }

  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json, application/xml, text/xml;q=0.9, */*;q=0.8");
  }
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "Academic-Publication-Counter/1.0");
  }
  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", "en-US,en;q=0.9");
  }

  const attempts: DblpAttemptDetails[] = [];
  for (const [hostIndex, host] of DBLP_HOSTS.entries()) {
    if (hostIndex > 0) console.warn("[DBLP fallback]", { trying: host, path });
    const url = new URL(path, host).toString();
    let retriedRateLimit = false;

    while (true) {
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetchWithTimeout(url, { ...options, headers });
      } catch (error) {
        const attempt = {
          host,
          url,
          elapsedMs: Date.now() - startedAt,
          ...errorDetails(error),
        };
        attempts.push(attempt);
        console.error("[DBLP]", attempt);
        break;
      }

      const retryAfter = response.headers.get("retry-after");
      const contentType = response.headers.get("content-type");
      const attempt: DblpAttemptDetails = {
        host,
        url,
        status: response.status,
        statusText: response.statusText,
        elapsedMs: Date.now() - startedAt,
        retryAfter,
        contentType,
      };

      if (response.ok) {
        console.log("[DBLP]", attempt);
        console.log("[DBLP success]", { host, url });
        return { response, host };
      }

      let bodyPreview = "";
      try {
        bodyPreview = (await response.text()).slice(0, 300);
      } catch (error) {
        Object.assign(attempt, errorDetails(error));
      }
      attempts.push(attempt);
      console.error("[DBLP]", { ...attempt, bodyPreview });

      if (!FALLBACK_STATUSES.has(response.status)) {
        throw new DblpUpstreamError(
          `DBLP rejected the request with HTTP ${response.status}`,
          attempts,
        );
      }

      if (response.status === 429 && !retriedRateLimit) {
        retriedRateLimit = true;
        await wait(retryDelayMs(retryAfter));
        continue;
      }
      break;
    }
  }

  throw new DblpUpstreamError("All DBLP upstream hosts failed", attempts);
}
