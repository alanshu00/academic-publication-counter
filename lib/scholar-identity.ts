import type { Author, IdentityMatch, Publication, Scholar } from "@/types";

export function normalizePid(pid: string): string {
  return decodeURIComponent(pid)
    .trim()
    .replace(/^https?:\/\/dblp\.org\/pid\//i, "")
    .replace(/\.(?:html|xml)$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

/**
 * Conservative normalization only. Numeric DBLP disambiguation suffixes and
 * initials are deliberately preserved because they carry identity information.
 */
export function normalizeAuthorName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[.,;:()\[\]{}'’"]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

export function getIdentityMatch(author: Author, scholar: Scholar): IdentityMatch {
  if (author.pid) {
    return scholar.pid && normalizePid(author.pid) === normalizePid(scholar.pid) ? "pid" : "unverified";
  }

  const normalizedAuthor = normalizeAuthorName(author.name);
  if (!normalizedAuthor) return "unverified";

  if (normalizeAuthorName(scholar.name) === normalizedAuthor) return "name";
  return (scholar.aliases ?? []).some((name) => normalizeAuthorName(name) === normalizedAuthor)
    ? "alias" : "unverified";
}

export function isSameScholar(author: Author, scholar: Scholar): boolean {
  return getIdentityMatch(author, scholar) !== "unverified";
}

export function publicationIdentityMatch(
  publication: Pick<Publication, "authors">,
  scholar: Scholar,
): IdentityMatch {
  for (const author of publication.authors) {
    const match = getIdentityMatch(author, scholar);
    if (match !== "unverified") return match;
  }
  return "unverified";
}

export function findSelectedScholarAuthorIndex(
  publication: Pick<Publication, "authors">,
  scholar: Scholar,
): number | null {
  const index = publication.authors.findIndex((author) => isSameScholar(author, scholar));
  return index >= 0 ? index : null;
}

export function isSelectedScholarInPublication(
  publication: Pick<Publication, "authors">,
  scholar: Scholar,
): boolean {
  return publicationIdentityMatch(publication, scholar) !== "unverified";
}

export function isSelectedScholarFirstAuthor(
  publication: Pick<Publication, "authors">,
  scholar: Scholar,
): boolean {
  const first = publication.authors[0];
  return first ? getIdentityMatch(first, scholar) !== "unverified" : false;
}
