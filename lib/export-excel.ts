import * as XLSX from "xlsx";
import type { Publication, PublicationStats, Scholar } from "@/types";

function safeFilePart(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

export function exportPublicationsExcel(
  scholar: Scholar,
  from: number,
  to: number,
  stats: PublicationStats,
  publications: Publication[],
  excludedPublications: Publication[],
) {
  const summary = [
    ["Field", "Value"],
    ["Name", scholar.name],
    ["DBLP PID", scholar.pid],
    ["DBLP Profile", scholar.url ?? ""],
    ["From Year", from],
    ["To Year", to],
    ["Journal Papers", stats.journalPapers],
    ["Conference Papers", stats.conferencePapers],
    ["Journal First Author", stats.journalFirstAuthor],
    ["Conference First Author", stats.conferenceFirstAuthor],
    ["Total Publications", stats.totalPapers],
  ];
  const rows = publications.map((publication) => ({
    Year: publication.year,
    Title: publication.title,
    Type: publication.type,
    Venue: publication.venue,
    Authors: publication.authors.map((author) => author.name).join("; "),
    "First Author": publication.isFirstAuthor ? "Yes" : "No",
    URL: publication.url ?? "",
    DOI: publication.doi ?? "",
    "DBLP Key": publication.key,
    "Identity Match": publication.identityMatch,
  }));
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  const publicationSheet = XLSX.utils.json_to_sheet(rows);
  const auditRows = [...publications, ...excludedPublications].map((publication) => ({
    Year: publication.year ?? "",
    Title: publication.title,
    "DBLP Key": publication.key,
    DOI: publication.doi ?? "",
    "Raw DBLP Type": publication.rawType,
    "Final Type": publication.type ?? "Excluded",
    Venue: publication.venue,
    Authors: publication.authors.map((author) => `${author.name}${author.pid ? ` [${author.pid}]` : ""}`).join("; "),
    "Selected Scholar Position": publication.scholarAuthorIndex === null ? "Not verified" : publication.scholarAuthorIndex + 1,
    "Identity Match": publication.identityMatch,
    Status: publication.included ? "Counted"
      : publication.duplicateReason ? "Duplicate"
        : publication.isPreprint ? "Preprint excluded"
          : publication.needsReview ? "Needs review" : "Other excluded",
    Included: publication.included ? "Yes" : "No",
    "First Author": publication.isFirstAuthor ? "Yes" : "No",
    "Inclusion Reason": publication.inclusionReason ?? "",
    "Exclusion Reason": publication.exclusionReason ?? "",
    "Needs Review": publication.needsReview ? "Yes" : "No",
    "Duplicate Of": publication.duplicateOf ?? "",
    "Duplicate Reason": publication.duplicateReason ?? "",
    URL: publication.url ?? "",
  }));
  const auditSheet = XLSX.utils.json_to_sheet(auditRows);
  summarySheet["!cols"] = [{ wch: 26 }, { wch: 70 }];
  publicationSheet["!cols"] = [
    { wch: 8 }, { wch: 60 }, { wch: 14 }, { wch: 25 }, { wch: 60 },
    { wch: 14 }, { wch: 45 }, { wch: 28 }, { wch: 40 }, { wch: 16 },
  ];
  auditSheet["!cols"] = [{ wch: 8 }, { wch: 60 }, { wch: 38 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 28 }, { wch: 65 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 55 }, { wch: 55 }, { wch: 14 }, { wch: 38 }, { wch: 25 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, publicationSheet, "Publications");
  XLSX.utils.book_append_sheet(workbook, auditSheet, "Audit");
  XLSX.writeFile(workbook, `academic-publications-${safeFilePart(scholar.name)}-${from}-${to}.xlsx`);
}
