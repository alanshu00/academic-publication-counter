import { NextRequest, NextResponse } from "next/server";
import { searchAuthors } from "@/lib/dblp";

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
    return NextResponse.json(
      { success: false, error: "Unable to connect to DBLP. Please try again." },
      { status: 502 },
    );
  }
}
