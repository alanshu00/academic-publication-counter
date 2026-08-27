"use client";

import { jsonpRequest, JsonpRequestError } from "@/lib/jsonp";
import {
  asArray,
  calculateStats,
  decodeHtmlEntities,
  deduplicatePublications,
  isPreprintPublication,
  normalizeDoi,
  publicationCountsByYear,
} from "@/lib/publications";
import { normalizePid } from "@/lib/scholar-identity";
import type { Author, Publication, PublicationType, PublicationsResponse, Scholar } from "@/types";

const DBLP_BASE = "https://dblp.org";
const PAGE_SIZE = 1_000;
const PAGINATION_DELAY_MS = 1_500;

type JsonRecord = Record<string, unknown>;

export type DblpClientErrorCode = "NETWORK" | "TIMEOUT" | "RATE_LIMITED" | "INVALID_RESPONSE";

export class DblpClientError extends Error {
  readonly code: DblpClientErrorCode;

  constructor(code: DblpClientErrorCode, message: string) {
    super(message);
    this.name = "DblpClientError";
    this.code = code;
  }
}

function objectValue(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const object = objectValue(value);
  const text = object?.text ?? object?.["#text"];
  return typeof text === "string" || typeof text === "number" ? String(text) : "";
}

function stringList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(stringList);
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  const object = objectValue(value);
  if (!object) return [];
  if (object.alias !== undefined) return stringList(object.alias);
  if (object.note !== undefined) return stringList(object.note);
  const text = textValue(object);
  return text ? [text] : [];
}

function responseHits(payload: JsonRecord): JsonRecord[] {
  const result = objectValue(payload.result);
  assertSuccessfulResponse(result);
  const hits = objectValue(result?.hits);
  return asArray(hits?.hit as JsonRecord | JsonRecord[] | undefined)
    .filter((hit): hit is JsonRecord => Boolean(hit && typeof hit === "object"));
}

function responseTotal(payload: JsonRecord): number {
  const hits = objectValue(objectValue(payload.result)?.hits);
  const total = Number(hits?.["@total"] ?? 0);
  return Number.isFinite(total) && total >= 0 ? total : 0;
}

function assertSuccessfulResponse(result?: JsonRecord) {
  if (!result) throw new DblpClientError("INVALID_RESPONSE", "DBLP returned an invalid response.");
  const status = objectValue(result.status);
  const code = Number(status?.["@code"] ?? 200);
  if (code === 429) {
    throw new DblpClientError("RATE_LIMITED", "DBLP rate limited this request.");
  }
  if (code !== 200) {
    throw new DblpClientError("NETWORK", `DBLP request failed (${code}).`);
  }
}

function normalizeClientError(error: unknown): never {
  if (error instanceof DblpClientError) throw error;
  if (error instanceof JsonpRequestError) {
    throw new DblpClientError(error.code, error.message);
  }
  throw new DblpClientError(
    "NETWORK",
    error instanceof Error ? error.message : "DBLP request failed.",
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function extractPidFromDblpUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/^https?:\/\/(?:www\.)?dblp\.org\/pid\/(.+?)(?:\.(?:html|xml))?\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function buildDblpAuthorQueryToken(name: string): string {
  const canonicalName = name.trim().replace(/\s+/g, "_");
  return `author:${canonicalName}:`;
}

export function parseAuthorSearchResponse(payload: JsonRecord): Scholar[] {
  return responseHits(payload).flatMap((hit) => {
    const info = objectValue(hit.info);
    const author = textValue(info?.author);
    const url = textValue(info?.url);
    if (!author || !url) return [];
    const pid = extractPidFromDblpUrl(url);
    return [{
      name: author,
      pid,
      url: `${url.replace(/\.(?:html|xml)$/i, "")}.html`,
      aliases: stringList(info?.aliases),
      note: stringList(info?.notes).join(" · ") || undefined,
    }];
  });
}

export async function searchDblpAuthors(name: string): Promise<Scholar[]> {
  const params = new URLSearchParams({
    q: name.trim(),
    format: "jsonp",
    h: "20",
    c: "0",
  });
  try {
    const payload = await jsonpRequest<JsonRecord>(`${DBLP_BASE}/search/author/api?${params}`);
    return parseAuthorSearchResponse(payload);
  } catch (error) {
    normalizeClientError(error);
  }
}

export function normalizeSearchApiAuthors(value: unknown): Author[] {
  return asArray(value as unknown | unknown[] | undefined)
    .flatMap((entry): Author[] => {
      if (typeof entry === "string") return entry ? [{ name: entry }] : [];
      const object = objectValue(entry);
      if (!object) return [];
      const name = textValue(object);
      if (!name) return [];
      const pid = textValue(object["@pid"] ?? object.pid);
      return [{ name, ...(pid && { pid }) }];
    });
}

export function classifySearchApiType(rawType: string): PublicationType | null {
  if (rawType === "Journal Articles") return "Journal";
  if (rawType === "Conference and Workshop Papers") return "Conference";
  return null;
}

function extractDoi(info: JsonRecord, eeUrls: string[]): string | undefined {
  const explicit = textValue(info.doi);
  if (explicit) return normalizeDoi(explicit);
  const doiUrl = eeUrls.find((url) => /doi\.org\/|^doi:|^10\.\d{4,9}\//i.test(url));
  return normalizeDoi(doiUrl);
}

function applyAuditRules(records: Publication[], from: number, to: number) {
  const deduplication = deduplicatePublications(records);
  const duplicateMap = new Map(
    deduplication.duplicates.map((duplicate) => [duplicate.publication, duplicate]),
  );

  for (const publication of records) {
    const duplicate = duplicateMap.get(publication);
    publication.included = true;
    if (duplicate) {
      const target = deduplication.kept.find((candidate) => candidate.key === duplicate.duplicateOf);
      publication.included = false;
      publication.duplicateOf = duplicate.duplicateOf;
      publication.duplicateReason = duplicate.duplicateReason;
      publication.exclusionReason = duplicate.duplicateReason === "preprint-published-version"
        ? `Preprint duplicate of published version: "${target?.title ?? duplicate.duplicateOf}" — ${target?.venue ?? "Unknown Venue"}${target?.year ? ` (${target.year})` : ""}.`
        : duplicate.duplicateReason === "same-dblp-key"
          ? "Duplicate publication record with the same DBLP key."
          : duplicate.duplicateReason === "same-doi"
            ? "Duplicate publication record with the same normalized DOI."
            : "High-confidence metadata duplicate with identical title and author PID sequence.";
    } else if (publication.rawType === "Informal and Other Publications") {
      publication.included = false;
      publication.exclusionReason = "DBLP classifies this record as Informal and Other Publications.";
    } else if (publication.isPreprint) {
      publication.included = false;
      publication.exclusionReason = "Preprint / CoRR record; not counted as a formal journal or conference publication.";
    } else if (!publication.type) {
      publication.included = false;
      publication.exclusionReason = `DBLP classifies this record as ${publication.rawType || "an unsupported publication type"}.`;
    } else if (publication.year === null) {
      publication.included = false;
      publication.exclusionReason = "Publication year unavailable.";
    } else if (publication.year < from || publication.year > to) {
      publication.included = false;
      publication.exclusionReason = "Outside selected year range.";
    } else if (publication.scholarAuthorIndex === null) {
      publication.included = false;
      publication.exclusionReason = "Selected scholar PID was not found in the DBLP author list.";
    }
    publication.isFirstAuthor = publication.included && publication.scholarAuthorIndex === 0;
    publication.inclusionReason = publication.included && publication.type
      ? `Counted as ${publication.type} because DBLP classifies this record as '${publication.rawType}', the selected PID is present, and no duplicate was found.`
      : undefined;
    publication.needsReview = publication.isPreprint || publication.year === null
      || publication.identityMatch !== "pid" || publication.title === "Untitled"
      || publication.venue === "Unknown Venue" || publication.authors.length === 0
      || publication.duplicateReason === "metadata-duplicate";
  }
}

export function parsePublicationSearchResponse(
  hits: JsonRecord[],
  scholar: Scholar,
  from: number,
  to: number,
) {
  if (!scholar.pid) throw new DblpClientError("INVALID_RESPONSE", "A DBLP PID is required.");
  const selectedPid = normalizePid(scholar.pid);
  const records = hits.flatMap((hit, index): Publication[] => {
    const info = objectValue(hit.info);
    if (!info) return [];
    const authorsRoot = objectValue(info.authors);
    const authors = normalizeSearchApiAuthors(authorsRoot?.author);
    const authorIndex = authors.findIndex(
      (author) => Boolean(author.pid) && normalizePid(author.pid!) === selectedPid,
    );
    const rawYear = textValue(info.year);
    const numericYear = Number(rawYear);
    const year = rawYear && Number.isInteger(numericYear) ? numericYear : null;
    const rawType = textValue(info.type);
    const type = classifySearchApiType(rawType);
    const eeUrls = stringList(info.ee);
    const rawKey = textValue(info.key);
    const record: Publication = {
      key: rawKey || `missing-key-${index}`,
      title: decodeHtmlEntities(textValue(info.title)).replace(/\s+/g, " ").trim() || "Untitled",
      year,
      type,
      rawType,
      venue: decodeHtmlEntities(textValue(info.venue)).trim() || "Unknown Venue",
      authors,
      url: textValue(info.url) || eeUrls[0] || undefined,
      doi: extractDoi(info, eeUrls),
      eeUrls,
      isPreprint: false,
      scholarAuthorIndex: authorIndex >= 0 ? authorIndex : null,
      isFirstAuthor: false,
      identityMatch: authorIndex >= 0 ? "pid" : "unverified",
      included: false,
      needsReview: false,
    };
    record.isPreprint = isPreprintPublication(record);
    if (record.isPreprint) record.type = null;
    return [record];
  });

  applyAuditRules(records, from, to);
  const sortRecords = (left: Publication, right: Publication) =>
    (right.year ?? -Infinity) - (left.year ?? -Infinity) || left.title.localeCompare(right.title);
  return {
    publications: records.filter((record) => record.included).sort(sortRecords),
    excludedPublications: records.filter((record) => !record.included).sort(sortRecords),
    rawCount: records.length,
  };
}

async function fetchPublicationHits(scholar: Scholar): Promise<JsonRecord[]> {
  const allHits: JsonRecord[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const params = new URLSearchParams({
      q: buildDblpAuthorQueryToken(scholar.name),
      format: "jsonp",
      h: String(PAGE_SIZE),
      f: String(offset),
      c: "0",
    });
    const payload = await jsonpRequest<JsonRecord>(`${DBLP_BASE}/search/publ/api?${params}`);
    const pageHits = responseHits(payload);
    total = responseTotal(payload);
    allHits.push(...pageHits);
    if (pageHits.length === 0 || offset + pageHits.length >= total) break;
    offset += pageHits.length;
    await wait(PAGINATION_DELAY_MS);
  }

  return allHits;
}

export async function searchDblpPublications(
  scholar: Scholar,
  from: number,
  to: number,
): Promise<PublicationsResponse> {
  try {
    const hits = await fetchPublicationHits(scholar);
    const parsed = parsePublicationSearchResponse(hits, scholar, from, to);
    const publications = parsed.publications;
    const excludedPublications = parsed.excludedPublications;
    return {
      success: true,
      scholar,
      period: { from, to },
      stats: calculateStats(publications),
      publications,
      excludedPublications,
      auditSummary: {
        countedRecords: publications.length,
        excludedRecords: excludedPublications.length,
        needsReview: [...publications, ...excludedPublications].filter((item) => item.needsReview).length,
        duplicateRecordsRemoved: excludedPublications.filter((item) => Boolean(item.duplicateReason)).length,
        preprintsExcluded: excludedPublications.filter((item) => item.isPreprint).length,
        otherExcluded: excludedPublications.filter((item) => !item.isPreprint && !item.duplicateReason).length,
      },
      countsByYear: publicationCountsByYear(publications),
      lastChecked: new Date().toISOString(),
      ...(process.env.NODE_ENV === "development" && {
        debug: {
          rawCount: parsed.rawCount,
          filteredCount: publications.length,
          excludedCount: excludedPublications.length,
        },
      }),
    };
  } catch (error) {
    normalizeClientError(error);
  }
}

export function dblpClientErrorMessage(error: unknown): string {
  if (!(error instanceof DblpClientError)) return "DBLP request failed. Please try again.";
  if (error.code === "TIMEOUT") return "DBLP request timed out. Please try again.";
  if (error.code === "RATE_LIMITED") return "DBLP rate limited this request. Please wait and try again.";
  if (error.code === "INVALID_RESPONSE") return "DBLP returned an invalid response. Please try again.";
  return "DBLP request failed. Please try again.";
}
