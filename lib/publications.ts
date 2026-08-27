import type { Author, DeduplicationResult, DuplicateReason, Publication, PublicationStats } from "@/types";
import { normalizeAuthorName, normalizePid } from "@/lib/scholar-identity";

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function calculateStats(publications: Publication[]): PublicationStats {
  const counted = publications.filter((item) => item.included);
  const journalPapers = counted.filter((item) => item.type === "Journal").length;
  const conferencePapers = counted.filter((item) => item.type === "Conference").length;
  const journalFirstAuthor = counted.filter(
    (item) => item.type === "Journal" && item.isFirstAuthor,
  ).length;
  const conferenceFirstAuthor = counted.filter(
    (item) => item.type === "Conference" && item.isFirstAuthor,
  ).length;
  return {
    journalPapers,
    conferencePapers,
    journalFirstAuthor,
    conferenceFirstAuthor,
    totalPapers: journalPapers + conferencePapers,
  };
}

export function normalizeDoi(doi?: string): string | undefined {
  if (!doi) return undefined;
  const normalized = decodeURIComponent(doi)
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
  return normalized || undefined;
}

export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  let result = value;
  for (let pass = 0; pass < 2; pass += 1) {
    result = result
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
      .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity);
  }
  return result;
}

export function normalizePublicationTitle(title: string): string {
  return decodeHtmlEntities(title)
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[‐‑‒–—―:;,.!?()[\]{}'’"/\\]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeAuthorList(authors: Author[]): string[] {
  return authors.map((author) => author.pid
    ? `pid:${normalizePid(author.pid)}`
    : `name:${normalizeAuthorName(author.name)}`);
}

export function authorListsMatch(left: Author[], right: Author[]): boolean {
  if (!left.length || left.length !== right.length) return false;
  return left.every((author, index) => {
    const other = right[index];
    if (author.pid && other.pid) return normalizePid(author.pid) === normalizePid(other.pid);
    return normalizeAuthorName(author.name) === normalizeAuthorName(other.name);
  });
}

export function isPreprintPublication(publication: Pick<Publication, "venue" | "url" | "eeUrls" | "key">): boolean {
  const venue = publication.venue.trim().toLowerCase();
  return venue === "corr" || venue === "arxiv"
    || publication.key.toLowerCase().startsWith("journals/corr/")
    || [publication.url, ...publication.eeUrls].some((url) => url?.toLowerCase().includes("arxiv.org"));
}

export function isPreprintVersionOf(preprint: Publication, published: Publication): boolean {
  if (!preprint.isPreprint || published.isPreprint) return false;
  if (preprint.year === null || published.year === null || Math.abs(preprint.year - published.year) > 2) return false;
  return normalizePublicationTitle(preprint.title) === normalizePublicationTitle(published.title)
    && authorListsMatch(preprint.authors, published.authors);
}

function isHighConfidenceMetadataDuplicate(left: Publication, right: Publication): boolean {
  const completePidSequence = left.authors.length > 0
    && left.authors.every((author) => Boolean(author.pid))
    && right.authors.every((author) => Boolean(author.pid));
  return completePidSequence
    && left.rawType === right.rawType
    && left.year === right.year
    && normalizePublicationTitle(left.title) === normalizePublicationTitle(right.title)
    && authorListsMatch(left.authors, right.authors);
}

export function deduplicatePublications(publications: Publication[]): DeduplicationResult {
  const indexed = publications.map((publication, index) => ({ publication, index }));
  indexed.sort((a, b) => Number(a.publication.isPreprint) - Number(b.publication.isPreprint) || a.index - b.index);
  const kept: Publication[] = [];
  const duplicates: DeduplicationResult["duplicates"] = [];

  for (const { publication } of indexed) {
    let target: Publication | undefined;
    let duplicateReason: DuplicateReason | undefined;
    if (!publication.key.startsWith("missing-key-")) {
      target = kept.find((candidate) => candidate.key === publication.key);
      if (target) duplicateReason = "same-dblp-key";
    }
    const doi = normalizeDoi(publication.doi);
    if (!target && doi) {
      target = kept.find((candidate) => normalizeDoi(candidate.doi) === doi);
      if (target) duplicateReason = "same-doi";
    }
    if (!target && publication.isPreprint) {
      target = kept.find((candidate) => isPreprintVersionOf(publication, candidate));
      if (target) duplicateReason = "preprint-published-version";
    }
    if (!target) {
      target = kept.find((candidate) => !publication.isPreprint && !candidate.isPreprint
        && isHighConfidenceMetadataDuplicate(publication, candidate));
      if (target) duplicateReason = "metadata-duplicate";
    }
    if (target && duplicateReason) {
      duplicates.push({ publication, duplicateOf: target.key, duplicateReason });
    } else {
      kept.push(publication);
    }
  }

  const originalOrder = new Map(publications.map((publication, index) => [publication, index]));
  kept.sort((a, b) => originalOrder.get(a)! - originalOrder.get(b)!);
  return { kept, duplicates };
}

export function publicationCountsByYear(publications: Publication[]) {
  const counts = new Map<number, { year: number; journal: number; conference: number }>();
  for (const publication of publications) {
    if (!publication.included || publication.year === null) continue;
    const entry = counts.get(publication.year) ?? { year: publication.year, journal: 0, conference: 0 };
    if (publication.type === "Journal") entry.journal += 1;
    if (publication.type === "Conference") entry.conference += 1;
    counts.set(publication.year, entry);
  }
  return [...counts.values()].sort((a, b) => b.year - a.year);
}
