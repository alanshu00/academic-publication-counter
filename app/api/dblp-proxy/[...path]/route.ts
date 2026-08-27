import { NextRequest, NextResponse } from "next/server";
import { DblpUpstreamError, fetchDblpWithFallback } from "@/lib/dblp-fetch";

export const runtime = "edge";

function allowedPath(path: string): boolean {
  return path === "search/author/api" || /^pid\/(?:[^/]+\/)+[^/]+\.xml$/.test(path);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!allowedPath(path)) {
    return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  }

  try {
    const accept = path.startsWith("pid/") ? "application/xml,text/xml" : "application/json";
    const { response } = await fetchDblpWithFallback(
      `/${path}${request.nextUrl.search}`,
      { headers: { Accept: accept }, cache: "no-store" },
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: { "Content-Type": response.headers.get("content-type") ?? accept },
    });
  } catch (error) {
    console.error("DBLP edge proxy failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "DBLP is temporarily unavailable.",
        debugCode: "DBLP_UPSTREAM_UNAVAILABLE",
        ...(process.env.NODE_ENV !== "production" && error instanceof DblpUpstreamError && {
          details: { attempts: error.attempts },
        }),
      },
      { status: 503 },
    );
  }
}
