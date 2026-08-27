import { NextRequest, NextResponse } from "next/server";
import { getPublications } from "@/lib/dblp";
import { DblpUpstreamError } from "@/lib/dblp-fetch";
import { calculateStats, publicationCountsByYear } from "@/lib/publications";
import type { Scholar } from "@/types";

export const runtime = "nodejs";

function validYear(value: string | null): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const pid = params.get("pid")?.trim();
  const name = params.get("name")?.trim();
  const from = validYear(params.get("from"));
  const to = validYear(params.get("to"));
  if (!pid || !name || from === null || to === null || from > to) {
    return NextResponse.json(
      { success: false, error: "A valid scholar, start year, and end year are required." },
      { status: 400 },
    );
  }
  const scholar: Scholar = {
    pid,
    name,
    url: `https://dblp.org/pid/${pid}.html`,
    aliases: params.getAll("alias"),
  };
  try {
    const parsed = await getPublications(scholar, from, to);
    const publications = parsed.publications;
    const excludedPublications = parsed.excludedPublications;
    return NextResponse.json({
      success: true,
      scholar: { ...scholar, name: parsed.scholarName || scholar.name },
      period: { from, to },
      stats: calculateStats(publications),
      publications,
      excludedPublications,
      auditSummary: {
        countedRecords: publications.length,
        excludedRecords: excludedPublications.length,
        needsReview: [...publications, ...excludedPublications].filter((item) => item.needsReview).length,
        duplicateRecordsRemoved: excludedPublications.filter((item) => Boolean(item.duplicateReason)).length,
        preprintsExcluded: excludedPublications.filter((item) => item.isPreprint).length,
        otherExcluded: excludedPublications.filter((item) => !item.isPreprint && !item.duplicateReason).length,
      },
      countsByYear: publicationCountsByYear(publications),
      lastChecked: new Date().toISOString(),
      ...(process.env.NODE_ENV === "development" && {
        debug: {
          rawCount: parsed.rawCount,
          filteredCount: publications.length,
          excludedCount: excludedPublications.length,
        },
      }),
    });
  } catch (error) {
    console.error(`DBLP publication fetch failed for PID ${pid}:`, error);
    if (!(error instanceof DblpUpstreamError)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to retrieve or parse DBLP publications. Please try again.",
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
