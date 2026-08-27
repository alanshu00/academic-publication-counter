import { ExternalLink, UserRound, ArrowRight } from "lucide-react";
import type { Scholar } from "@/types";

interface Props {
  scholars: Scholar[];
  loadingPid?: string;
  onSelect: (scholar: Scholar) => void;
}

export default function ScholarSelector({ scholars, loadingPid, onSelect }: Props) {
  if (!scholars.length) return null;
  return (
    <section className="section-block" aria-labelledby="candidate-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Identity check</p>
          <h2 id="candidate-title">Select the correct scholar</h2>
          <p>DBLP may list multiple people with the same name. Confirm the profile before analysis.</p>
        </div>
        <span className="result-count">{scholars.length} candidates</span>
      </div>
      <div className="candidate-grid">
        {scholars.map((scholar, index) => (
          <article className="candidate-card" key={scholar.pid ?? `${scholar.name}-${index}`}>
            <div className="avatar"><UserRound size={22} /></div>
            <div className="candidate-copy">
              <h3>{scholar.name}</h3>
              <p className="pid">{scholar.pid ? `PID · ${scholar.pid}` : "DBLP PID unavailable"}</p>
              {scholar.note && <p className="note">{scholar.note}</p>}
              {scholar.aliases && scholar.aliases.length > 0 && (
                <p className="aliases">Also: {scholar.aliases.join(", ")}</p>
              )}
              <a href={scholar.url} target="_blank" rel="noreferrer">
                View DBLP profile <ExternalLink size={13} />
              </a>
            </div>
            <button type="button" className="select-button" onClick={() => onSelect(scholar)} disabled={Boolean(loadingPid) || !scholar.pid}>
              {loadingPid === scholar.pid ? <span className="spinner dark" /> : <>Select <ArrowRight size={16} /></>}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
