import { XMLParser } from "fast-xml-parser";
import type { Publication, Scholar } from "@/types";
import {
  asArray,
  classifyRecordType,
  deduplicatePublications,
  isPreprintPublication,
  normalizeDoi,
  normalizeAuthors,
  textValue,
} from "@/lib/publications";
import {
  findSelectedScholarAuthorIndex,
  getIdentityMatch,
} from "@/lib/scholar-identity";
import { fetchDblpWithFallback } from "@/lib/dblp-fetch";

const DBLP_BASE = "https://dblp.org";

type JsonRecord = Record<string, unknown>;

function stringList(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(stringList);
  if (typeof value !== "object") return [];
  const object = value as JsonRecord;
  if (typeof object["#text"] === "string") return [object["#text"]];
  if (typeof object.text === "string") return [object.text];
  if (object.alias !== undefined) return stringList(object.alias);
  if (object.note !== undefined) return stringList(object.note);
  return [];
}

export async function searchAuthors(name: string): Promise<Scholar[]> {
  const params = new URLSearchParams({
    q: name.trim(),
    format: "json",
    h: "10",
  });
  const { response } = await fetchDblpWithFallback(`/search/author/api?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = (await response.json()) as JsonRecord;
  const result = data.result as JsonRecord | undefined;
  const hits = result?.hits as JsonRecord | undefined;
  return asArray(hits?.hit as JsonRecord | JsonRecord[] | undefined).flatMap((hit) => {
    const info = hit.info as JsonRecord | undefined;
    const author = info?.author as string | undefined;
    const urlValue = info?.url as string | undefined;
    if (!author) return [];
    const pid = extractPidFromDblpUrl(urlValue);
    return [{
      name: author,
      pid,
      url: urlValue ? `${urlValue.replace(/\.(?:html|xml)$/i, "")}.html` : undefined,
      aliases: stringList(info?.aliases),
      note: stringList(info?.notes).join(" · ") || undefined,
    }];
  });
}

export function extractPidFromDblpUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/^https?:\/\/(?:www\.)?dblp\.org\/pid\/(.+?)(?:\.(?:html|xml))?\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function extractDoi(ee: string[]): string | undefined {
  const value = ee.find((candidate) => /doi\.org\/|^doi:|^10\.\d{4,9}\//i.test(candidate));
  return value?.includes("doi.org/") ? value.split(/doi\.org\//i)[1] : value;
}

export interface ParsedPersonExport {
  scholarName?: string;
  publications: Publication[];
  excludedPublications: Publication[];
  rawCount: number;
}

const DBLP_RECORD_TYPES = new Set([
  "article", "inproceedings", "incollection", "book", "proceedings",
  "phdthesis", "mastersthesis", "www", "data",
]);

export function parsePersonXml(xml: string, scholar: Scholar, from: number, to: number): ParsedPersonExport {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    processEntities: true,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as JsonRecord;
  const dblpperson = parsed.dblpperson as JsonRecord | undefined;
  if (!dblpperson) throw new Error("Invalid DBLP person XML response");
  const recordsRoot = dblpperson.r;
  const wrappers = asArray(recordsRoot as JsonRecord | JsonRecord[] | undefined);
  const rawCount = wrappers.length;
  const auditRecords: Publication[] = [];

  for (const [wrapperIndex, wrapper] of wrappers.entries()) {
    if (!wrapper || typeof wrapper !== "object") continue;
    const entry = Object.entries(wrapper).find(([type]) => DBLP_RECORD_TYPES.has(type));
    if (!entry) continue;
    const [recordType, rawRecord] = entry;
    if (!rawRecord || typeof rawRecord !== "object") continue;
    const record = rawRecord as JsonRecord;
    const rawClassification = classifyRecordType(recordType);
    const rawYear = textValue(record.year);
    const parsedYear = Number(rawYear);
    const year = rawYear && Number.isInteger(parsedYear) ? parsedYear : null;
    const authors = normalizeAuthors(record.author as Parameters<typeof normalizeAuthors>[0]);
    const ee = stringList(record.ee);
    const rawKey = textValue(record["@_key"]);
    const key = rawKey || `missing-key-${wrapperIndex}`;
    const scholarAuthorIndex = findSelectedScholarAuthorIndex({ authors }, scholar);
    const identityMatch = scholarAuthorIndex === null
      ? "unverified"
      : getIdentityMatch(authors[scholarAuthorIndex], scholar);
    const venue = textValue(
      rawClassification === "Journal" ? record.journal
        : rawClassification === "Conference" ? record.booktitle
          : record.booktitle ?? record.journal ?? record.publisher ?? record.school,
    ) || "Unknown Venue";
    const title = textValue(record.title).replace(/\s+/g, " ").trim() || "Untitled";
    const draft: Publication = {
      key,
      title,
      year,
      type: rawClassification,
      rawType: recordType,
      venue,
      authors,
      url: ee[0] || (rawKey ? `${DBLP_BASE}/rec/${rawKey}` : undefined),
      doi: normalizeDoi(extractDoi(ee)),
      eeUrls: ee,
      isPreprint: false,
      scholarAuthorIndex,
      isFirstAuthor: false,
      identityMatch,
      included: false,
      needsReview: false,
    };
    draft.isPreprint = isPreprintPublication(draft);
    if (draft.isPreprint) draft.type = null;
    auditRecords.push(draft);
  }

  const deduplication = deduplicatePublications(auditRecords);
  const duplicateMap = new Map(deduplication.duplicates.map((duplicate) => [duplicate.publication, duplicate]));
  for (const publication of auditRecords) {
    const duplicate = duplicateMap.get(publication);
    publication.included = true;
    if (duplicate) {
      const target = deduplication.kept.find((candidate) => candidate.key === duplicate.duplicateOf);
      publication.included = false;
      publication.duplicateOf = duplicate.duplicateOf;
      publication.duplicateReason = duplicate.duplicateReason;
      publication.exclusionReason = duplicate.duplicateReason === "preprint-published-version"
        ? `Preprint duplicate of published version: "${target?.title ?? duplicate.duplicateOf}" — ${target?.venue ?? "Unknown Venue"}${target?.year ? ` (${target.year})` : ""}.`
        : duplicate.duplicateReason === "same-dblp-key" ? "Duplicate publication record with the same DBLP key."
          : duplicate.duplicateReason === "same-doi" ? "Duplicate publication record with the same normalized DOI."
            : "High-confidence metadata duplicate with identical title and author PID sequence.";
    } else if (publication.isPreprint) {
      publication.included = false;
      publication.exclusionReason = "Preprint / CoRR record; not counted as a formal journal or conference publication.";
    } else if (!publication.type) {
      publication.included = false;
      publication.exclusionReason = `DBLP record type '${publication.rawType}' is not counted as Journal or Conference.`;
    } else if (publication.year === null) {
      publication.included = false;
      publication.exclusionReason = "Publication year unavailable.";
    } else if (publication.year < from || publication.year > to) {
      publication.included = false;
      publication.exclusionReason = "Outside selected year range.";
    } else if (publication.scholarAuthorIndex === null) {
      publication.included = false;
      publication.exclusionReason = "Selected scholar identity could not be verified in the author list.";
    }
    publication.isFirstAuthor = publication.included && publication.scholarAuthorIndex === 0;
    publication.inclusionReason = publication.included && publication.type
      ? `Counted as ${publication.type} because DBLP classifies this record as '${publication.rawType}', it is not a preprint, and no duplicate was found.`
      : undefined;
    publication.needsReview = publication.isPreprint || publication.year === null
      || publication.identityMatch !== "pid" || publication.title === "Untitled"
      || publication.venue === "Unknown Venue" || publication.authors.length === 0
      || publication.duplicateReason === "metadata-duplicate";
  }

  const sortRecords = (a: Publication, b: Publication) =>
    (b.year ?? -Infinity) - (a.year ?? -Infinity) || a.title.localeCompare(b.title);
  const publications = auditRecords.filter((record) => record.included).sort(sortRecords);
  const excludedPublications = auditRecords.filter((record) => !record.included).sort(sortRecords);
  return {
    scholarName: textValue(dblpperson.author),
    publications,
    excludedPublications,
    rawCount,
  };
}

export async function getPublications(scholar: Scholar, from: number, to: number) {
  if (!scholar.pid) throw new Error("A DBLP PID is required for publication analysis");
  const pidPath = scholar.pid.split("/").map(encodeURIComponent).join("/");
  const { response } = await fetchDblpWithFallback(`/pid/${pidPath}.xml`, {
    headers: { Accept: "application/xml,text/xml" },
    cache: "no-store",
  });
  return parsePersonXml(await response.text(), scholar, from, to);
}
