import type { PublicationStats, PublicationsResponse } from "@/types";

export default function CountValidation({ stats, audit, years }: {
  stats: PublicationStats;
  audit: PublicationsResponse["auditSummary"];
  years: PublicationsResponse["countsByYear"];
}) {
  return (
    <section className="validation-panel" aria-labelledby="validation-title">
      <div>
        <p className="eyebrow">Count validation</p>
        <h2 id="validation-title">Trace every number</h2>
        <div className="validation-totals">
          <span>Journal <strong>{stats.journalPapers}</strong></span>
          <span>Conference <strong>{stats.conferencePapers}</strong></span>
          <span>Counted records <strong>{audit.countedRecords}</strong></span>
          <span>Excluded records <strong>{audit.excludedRecords}</strong></span>
          <span>Duplicate records removed <strong>{audit.duplicateRecordsRemoved}</strong></span>
          <span>Preprints excluded <strong>{audit.preprintsExcluded}</strong></span>
          <span>Other excluded <strong>{audit.otherExcluded}</strong></span>
          <span className={audit.needsReview ? "review-total" : ""}>Needs review <strong>{audit.needsReview}</strong></span>
        </div>
      </div>
      <div className="year-breakdown">
        <h3>Publication counts by year</h3>
        <div className="year-list">
          {years.map((item) => (
            <div key={item.year}><strong>{item.year}</strong><span>Journal {item.journal}</span><span>Conference {item.conference}</span></div>
          ))}
          {!years.length && <p>No counted publications in this period.</p>}
        </div>
      </div>
    </section>
  );
}
