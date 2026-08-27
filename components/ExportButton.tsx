"use client";

import { Download } from "lucide-react";
import { exportPublicationsExcel } from "@/lib/export-excel";
import type { Publication, PublicationStats, Scholar } from "@/types";

export default function ExportButton({ scholar, from, to, stats, publications, excludedPublications }: {
  scholar: Scholar; from: number; to: number; stats: PublicationStats; publications: Publication[];
  excludedPublications: Publication[];
}) {
  return (
    <button type="button" className="secondary-button" onClick={() => exportPublicationsExcel(scholar, from, to, stats, publications, excludedPublications)}>
      <Download size={17} /> Export Excel
    </button>
  );
}
