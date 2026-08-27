"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Check, Search, X } from "lucide-react";
import type { Publication, Scholar } from "@/types";
import { isSameScholar } from "@/lib/scholar-identity";

type TypeFilter = "All" | "Journal" | "Conference";

function AuthorList({ publication, scholar }: { publication: Publication; scholar: Scholar }) {
  return publication.authors.map((author, index) => {
    const selected = isSameScholar(author, scholar);
    return (
      <span key={`${author.name}-${index}`} className={selected ? "selected-author" : undefined}>
        {index > 0 && ", "}{author.name}
      </span>
    );
  });
}

export default function PublicationsTable({ publications, scholar }: { publications: Publication[]; scholar: Scholar }) {
  const [type, setType] = useState<TypeFilter>("All");
  const [firstOnly, setFirstOnly] = useState(false);
  const [year, setYear] = useState("All");
  const [query, setQuery] = useState("");
  const years = useMemo(() => [...new Set(publications.map((item) => item.year).filter((item): item is number => item !== null))].sort((a, b) => b - a), [publications]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return publications.filter((item) =>
      (type === "All" || item.type === type)
      && (!firstOnly || item.isFirstAuthor)
      && (year === "All" || item.year === Number(year))
      && (!needle || `${item.title} ${item.venue}`.toLowerCase().includes(needle)),
    );
  }, [firstOnly, publications, query, type, year]);

  return (
    <section className="table-section" aria-labelledby="publication-title">
      <div className="section-heading table-heading">
        <div>
          <p className="eyebrow">Bibliography</p>
          <h2 id="publication-title">Publications</h2>
          <p>{filtered.length} of {publications.length} records shown</p>
        </div>
      </div>
      <div className="filters">
        <div className="segmented" aria-label="Filter by publication type">
          {(["All", "Journal", "Conference"] as TypeFilter[]).map((value) => (
            <button type="button" key={value} className={type === value ? "active" : ""} onClick={() => setType(value)}>{value}</button>
          ))}
        </div>
        <button type="button" className={`filter-toggle ${firstOnly ? "active" : ""}`} onClick={() => setFirstOnly((value) => !value)}>
          <Check size={15} /> First author only
        </button>
        <select aria-label="Filter by year" value={year} onChange={(event) => setYear(event.target.value)}>
          <option value="All">All years</option>
          {years.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="table-search">
          <Search size={16} />
          <span className="sr-only">Search title or venue</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or venue" />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button>}
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Year</th><th>Title</th><th>Type audit</th><th>Venue</th><th>Authors</th><th>Scholar position</th><th>First author</th><th>Source</th></tr></thead>
          <tbody>
            {filtered.map((publication) => (
              <tr key={publication.key}>
                <td className="year-cell">{publication.year ?? "—"}</td>
                <td className="title-cell" title={publication.inclusionReason}>{publication.title}{publication.needsReview && <span className="review-badge">Needs Review</span>}</td>
                <td>{publication.type && <span className={`type-badge ${publication.type.toLowerCase()}`}>{publication.type}</span>}<small className="match-detail">raw: {publication.rawType}</small></td>
                <td className="venue-cell">{publication.venue}</td>
                <td className="authors-cell"><AuthorList publication={publication} scholar={scholar} /></td>
                <td>{publication.scholarAuthorIndex === null ? "Not verified" : `#${publication.scholarAuthorIndex + 1}`}<small className="match-detail">{publication.identityMatch}</small></td>
                <td>{publication.isFirstAuthor ? <span className="yes-badge" title={`Identity matched by ${publication.identityMatch}`}><Check size={13} /> Yes</span> : <span className="no-label">No</span>}</td>
                <td>{publication.url ? <a className="source-link" href={publication.url} target="_blank" rel="noreferrer" aria-label={`Open ${publication.title}`}><ArrowUpRight size={16} /> DBLP</a> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-table"><Search size={24} /><p>No publications match these filters.</p></div>}
      </div>
    </section>
  );
}
