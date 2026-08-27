import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DblpUpstreamError, fetchDblpWithFallback } from "@/lib/dblp-fetch";

describe("fetchDblpWithFallback", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back to the next host when fetch throws", async () => {
    const cause = Object.assign(new Error("Connect Timeout Error"), {
      name: "ConnectTimeoutError",
      code: "UND_ERR_CONNECT_TIMEOUT",
    });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed", { cause }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDblpWithFallback("/search/author/api?q=James+Lester", {
      headers: { Accept: "application/json" },
    });

    expect(result.host).toBe("https://dblp.uni-trier.de");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://dblp.org/search/author/api?q=James+Lester",
      "https://dblp.uni-trier.de/search/author/api?q=James+Lester",
    ]);
    const requestOptions = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = requestOptions.headers as Headers;
    expect(requestOptions.cache).toBe("no-store");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("User-Agent")).toBe("Academic-Publication-Counter/1.0");
    expect(headers.get("Accept-Language")).toBe("en-US,en;q=0.9");
    expect(console.error).toHaveBeenCalledWith("[DBLP]", expect.objectContaining({
      errorName: "TypeError",
      errorMessage: "fetch failed",
      causeName: "ConnectTimeoutError",
      causeCode: "UND_ERR_CONNECT_TIMEOUT",
    }));
  });

  it("retries a rate-limited host only once before succeeding", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "0" },
      }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDblpWithFallback("/search/author/api?q=test");

    expect(result.host).toBe("https://dblp.org");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not fall back for a non-host-specific 404 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDblpWithFallback("/missing")).rejects.toMatchObject({
      name: "DblpUpstreamError",
      attempts: [{ host: "https://dblp.org", status: 404 }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries all three hosts for fallback HTTP failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    let caught: unknown;
    try {
      await fetchDblpWithFallback("/search/author/api?q=test");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DblpUpstreamError);
    expect((caught as DblpUpstreamError).attempts).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("preserves slash-separated PID path segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<dblpperson />", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchDblpWithFallback("/pid/65/9612.xml", {
      headers: { Accept: "application/xml,text/xml" },
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://dblp.org/pid/65/9612.xml");
  });
});
