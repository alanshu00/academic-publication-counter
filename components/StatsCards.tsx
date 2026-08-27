import { BookOpen, Presentation, Medal, Layers } from "lucide-react";
import type { PublicationStats } from "@/types";

export default function StatsCards({ stats }: { stats: PublicationStats }) {
  const cards = [
    { label: "Journal papers", value: stats.journalPapers, icon: BookOpen, tone: "blue" },
    { label: "Conference papers", value: stats.conferencePapers, icon: Presentation, tone: "violet" },
    { label: "Journal first author", value: stats.journalFirstAuthor, icon: Medal, tone: "teal" },
    { label: "Conference first author", value: stats.conferenceFirstAuthor, icon: Medal, tone: "amber" },
    { label: "Total publications", value: stats.totalPapers, icon: Layers, tone: "navy" },
  ];
  return (
    <div className="stats-grid">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <article className={`stat-card ${tone}`} key={label}>
          <div className="stat-icon"><Icon size={20} /></div>
          <p>{label}</p>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}
