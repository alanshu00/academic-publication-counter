export interface Scholar {
  name: string;
  pid: string | null;
  url?: string;
  aliases?: string[];
  note?: string;
}

export interface Author {
  name: string;
  pid?: string;
}

export type PublicationType = "Journal" | "Conference";
export type IdentityMatch = "pid" | "alias" | "name" | "unverified";
export type DuplicateReason = "same-dblp-key" | "same-doi" | "preprint-published-version" | "metadata-duplicate";

export interface Publication {
  key: string;
  title: string;
  year: number | null;
  type: PublicationType | null;
  rawType: string;
  venue: string;
  authors: Author[];
  url?: string;
  doi?: string;
  eeUrls: string[];
  isPreprint: boolean;
  scholarAuthorIndex: number | null;
  isFirstAuthor: boolean;
  identityMatch: IdentityMatch;
  included: boolean;
  inclusionReason?: string;
  exclusionReason?: string;
  needsReview: boolean;
  duplicateOf?: string;
  duplicateReason?: DuplicateReason;
}

export interface DuplicateRecord {
  publication: Publication;
  duplicateOf: string;
  duplicateReason: DuplicateReason;
}

export interface DeduplicationResult {
  kept: Publication[];
  duplicates: DuplicateRecord[];
}

export interface PublicationStats {
  journalPapers: number;
  conferencePapers: number;
  journalFirstAuthor: number;
  conferenceFirstAuthor: number;
  totalPapers: number;
}

export interface PublicationsResponse {
  success: true;
  scholar: Scholar;
  period: { from: number; to: number };
  stats: PublicationStats;
  publications: Publication[];
  excludedPublications: Publication[];
  auditSummary: {
    countedRecords: number;
    excludedRecords: number;
    needsReview: number;
    duplicateRecordsRemoved: number;
    preprintsExcluded: number;
    otherExcluded: number;
  };
  countsByYear: Array<{
    year: number;
    journal: number;
    conference: number;
  }>;
  lastChecked: string;
  debug?: { rawCount: number; filteredCount: number; excludedCount: number };
}

export interface ApiError {
  success: false;
  error: string;
}
