"use client";

import { useState } from "react";
import { ArrowUpRight, AlertTriangle } from "lucide-react";
import PublicationsTable from "@/components/PublicationsTable";
import type { Publication, Scholar } from "@/types";

function authorPosition(index: number | null): string {
  if (index === null) return "Not verified";
  const number = index + 1;
  const suffix = number % 10 === 1 && number % 100 !== 11 ? "st"
    : number % 10 === 2 && number % 100 !== 12 ? "nd"
      : number % 10 === 3 && number % 100 !== 13 ? "rd" : "th";
  return `${number}${suffix}`;
}

function ExcludedTable({ publications }: { publications: Publication[] }) {
  return (
    <section className="table-section audit-excluded" aria-labelledby="excluded-title">
      <div className="section-heading table-heading">
        <div><p className="eyebrow">Audit trail</p><h2 id="excluded-title">Excluded / Needs Review</h2><p>{publications.length} records not included in official counts</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Year</th><th>Title</th><th>Raw type</th><th>Venue</th><th>Authors</th><th>Scholar position</th><th>Reason</th><th>Source</th></tr></thead>
          <tbody>
            {publications.map((publication) => (
              <tr key={`${publication.key}-${publication.exclusionReason}`}>
                <td className="year-cell">{publication.year ?? "—"}</td>
                <td className="title-cell">{publication.title}{publication.needsReview && <span className="review-badge"><AlertTriangle size={11} /> Needs Review</span>}</td>
                <td><code className="raw-type">{publication.rawType}</code></td>
                <td className="venue-cell">{publication.venue}</td>
                <td className="authors-cell">{publication.authors.map((author) => author.name).join(", ") || "Unavailable"}</td>
                <td>{authorPosition(publication.scholarAuthorIndex)}<small className="match-detail">{publication.identityMatch}</small></td>
                <td className="reason-cell">{publication.exclusionReason}{publication.duplicateOf && <small>Duplicate of {publication.duplicateOf}</small>}{publication.duplicateReason && <small>Reason: {publication.duplicateReason}</small>}</td>
                <td>{publication.url ? <a className="source-link" href={publication.url} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /> DBLP</a> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!publications.length && <div className="empty-table"><p>No excluded records.</p></div>}
      </div>
    </section>
  );
}

export default function PublicationAuditView({ publications, excludedPublications, scholar }: {
  publications: Publication[];
  excludedPublications: Publication[];
  scholar: Scholar;
}) {
  const [view, setView] = useState<"counted" | "excluded">(publications.length ? "counted" : "excluded");
  return (
    <div className="audit-view">
      <div className="audit-tabs" role="tablist" aria-label="Publication audit view">
        <button type="button" role="tab" aria-selected={view === "counted"} className={view === "counted" ? "active" : ""} onClick={() => setView("counted")}>Counted Publications <span>{publications.length}</span></button>
        <button type="button" role="tab" aria-selected={view === "excluded"} className={view === "excluded" ? "active" : ""} onClick={() => setView("excluded")}>Excluded / Needs Review <span>{excludedPublications.length}</span></button>
      </div>
      {view === "counted"
        ? <PublicationsTable publications={publications} scholar={scholar} />
        : <ExcludedTable publications={excludedPublications} />}
    </div>
  );
}
