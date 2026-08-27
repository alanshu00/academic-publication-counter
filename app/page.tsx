"use client";

import { useEffect, useRef, useState } from "react";
import { BookMarked, Database, ExternalLink, Info, RefreshCw } from "lucide-react";
import ScholarSearch from "@/components/ScholarSearch";
import ScholarSelector from "@/components/ScholarSelector";
import StatsCards from "@/components/StatsCards";
import PublicationAuditView from "@/components/PublicationAuditView";
import CountValidation from "@/components/CountValidation";
import ExportButton from "@/components/ExportButton";
import {
  dblpClientErrorMessage,
  searchDblpAuthors,
  searchDblpPublications,
} from "@/lib/dblp-client";
import type { PublicationsResponse, Scholar } from "@/types";

const currentYear = new Date().getFullYear();

export default function Home() {
  const [name, setName] = useState("");
  const [from, setFrom] = useState(2022);
  const [to, setTo] = useState(currentYear);
  const [scholars, setScholars] = useState<Scholar[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingPid, setLoadingPid] = useState<string>();
  const [data, setData] = useState<PublicationsResponse>();
  const [error, setError] = useState("");
  const candidatesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scholars.length > 0) {
      candidatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [scholars]);

  async function search() {
    setError(""); setData(undefined); setScholars([]); setLoadingPid(undefined);
    if (!name.trim()) { setError("Please enter a scholar name."); return; }
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      setError("Please enter valid From and To years."); return;
    }
    if (from > to) {
      setError("From year cannot be later than To year."); return;
    }
    setSearching(true);
    try {
      if (process.env.NODE_ENV === "development") {
        console.log("[Scholar Search] submitting", { name: name.trim(), fromYear: from, toYear: to });
      }
      const result = await searchDblpAuthors(name.trim());
      if (process.env.NODE_ENV === "development") {
        console.log("[Scholar Search] response", { candidates: result.length });
      }
      if (!result.length) setError("No scholar found on DBLP.");
      else setScholars(result);
    } catch (caught) {
      console.error("[Scholar Search] failed", caught);
      setError(dblpClientErrorMessage(caught));
    } finally { setSearching(false); }
  }

  async function analyze(scholar: Scholar) {
    if (!scholar.pid) {
      setError("This candidate has no DBLP PID and cannot be analyzed.");
      return;
    }
    setError(""); setLoadingPid(scholar.pid);
    try {
      const result = await searchDblpPublications(scholar, from, to);
      setData(result);
    } catch (caught) {
      setError(dblpClientErrorMessage(caught));
    } finally { setLoadingPid(undefined); }
  }

  return (
    <main>
      <nav>
        <a className="brand" href="#top"><span><BookMarked size={20} /></span>Academic Publication Counter</a>
        <a className="about-link" href="#about">About</a>
      </nav>
      <header id="top" className="hero">
        <div className="hero-glow one" /><div className="hero-glow two" />
        <div className="hero-content">
          <p className="hero-kicker"><Database size={14} /> Powered by DBLP bibliographic data</p>
          <h1>Count publications.<br /><em>Understand the record.</em></h1>
          <p className="hero-copy">Search a scholar and analyze journal, conference, and first-author publications across any year range.</p>
          <ScholarSearch name={name} from={from} to={to} loading={searching} onNameChange={setName} onFromChange={setFrom} onToChange={setTo} onSubmit={search} />
          {error && <div className="error-banner" role="alert"><Info size={18} /><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        </div>
      </header>

      <div className="content-shell">
        <div ref={candidatesRef} className="candidate-anchor">
          {!data && <ScholarSelector scholars={scholars} loadingPid={loadingPid} onSelect={analyze} />}
        </div>
        {loadingPid && <div className="analysis-loading"><span className="spinner dark" /><div><strong>Analyzing publications…</strong><p>Fetching and classifying DBLP records.</p></div></div>}
        {data && (
          <section className="results" aria-live="polite">
            <div className="scholar-bar">
              <div>
                <p className="eyebrow">Selected scholar</p>
                <h2>{data.scholar.name}</h2>
                <p>{data.period.from}—{data.period.to} · PID {data.scholar.pid}</p>
              </div>
              <div className="scholar-actions">
                <a className="profile-button" href={data.scholar.url} target="_blank" rel="noreferrer">DBLP profile <ExternalLink size={15} /></a>
                <button type="button" className="profile-button" onClick={() => setData(undefined)}>Change scholar</button>
                <button type="button" className="icon-button" onClick={() => analyze(data.scholar)} aria-label="Refresh analysis"><RefreshCw size={17} /></button>
                <ExportButton scholar={data.scholar} from={data.period.from} to={data.period.to} stats={data.stats} publications={data.publications} excludedPublications={data.excludedPublications} />
              </div>
            </div>
            <StatsCards stats={data.stats} />
            <CountValidation stats={data.stats} audit={data.auditSummary} years={data.countsByYear} />
            {data.publications.length === 0 && (
              <div className="no-results"><BookMarked size={30} /><h3>No publications in this period</h3><p>No journal or conference publications found between {data.period.from} and {data.period.to}.</p></div>
            )}
            <PublicationAuditView publications={data.publications} excludedPublications={data.excludedPublications} scholar={data.scholar} />
            <p className="last-checked">Last checked {new Date(data.lastChecked).toLocaleString()} · Data source: DBLP</p>
          </section>
        )}
      </div>
      <footer><span><BookMarked size={16} /> Academic Publication Counter</span><span>Data provided by <a href="https://dblp.org" target="_blank" rel="noreferrer">DBLP</a>.</span></footer>
    </main>
  );
}
