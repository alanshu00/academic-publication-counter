import { NextRequest, NextResponse } from "next/server";
import { searchAuthors } from "@/lib/dblp";
import { DblpUpstreamError } from "@/lib/dblp-fetch";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ success: false, error: "Scholar name is required." }, { status: 400 });
  }
  try {
    if (process.env.NODE_ENV === "development") console.log("[DBLP] search author:", name);
    const scholars = await searchAuthors(name);
    if (process.env.NODE_ENV === "development") {
      console.log("[DBLP] search complete:", { status: 200, candidates: scholars.length });
    }
    return NextResponse.json({ success: true, scholars });
  } catch (error) {
    console.error("DBLP author search failed:", error);
    if (!(error instanceof DblpUpstreamError)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to connect to DBLP. Please try again.",
          ...(process.env.NODE_ENV !== "production" && {
            details: { name: error instanceof Error ? error.name : "UnknownError", message: String(error) },
          }),
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: "DBLP is temporarily unavailable.",
        debugCode: "DBLP_UPSTREAM_UNAVAILABLE",
        ...(process.env.NODE_ENV !== "production" && {
          details: { attempts: error.attempts },
        }),
      },
      { status: 503 },
    );
  }
}
