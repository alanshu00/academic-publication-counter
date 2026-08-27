import { describe, expect, it } from "vitest";
import { extractPidFromDblpUrl, parsePersonXml } from "@/lib/dblp";
import {
  calculateStats,
  authorListsMatch,
  classifyRecordType,
  deduplicatePublications,
  isPreprintPublication,
  isPreprintVersionOf,
  normalizePublicationTitle,
  normalizeDoi,
  normalizeAuthors,
} from "@/lib/publications";
import {
  getIdentityMatch,
  isSameScholar,
  isSelectedScholarFirstAuthor,
  isSelectedScholarInPublication,
  normalizeAuthorName,
} from "@/lib/scholar-identity";
import type { Publication, Scholar } from "@/types";

const scholar: Scholar = { name: "James Lester", pid: "65/9612", aliases: ["James C. Lester"] };
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<dblpperson pid="65/9612" name="James C. Lester">
  <author pid="65/9612">James C. Lester</author>
  <r><article key="journals/example/a"><author pid="65/9612">James C. Lester</author><author pid="x/1">Jos&#233; Test</author><title>Journal Work.</title><year>2022</year><journal>Example Journal</journal><ee>https://doi.org/10.1/test</ee></article></r>
  <r><inproceedings key="conf/example/b"><author pid="x/1">Other Author</author><author pid="65/9612">James C. Lester</author><title>Conference Work.</title><year>2026</year><booktitle>Example Conference</booktitle></inproceedings></r>
  <r><article key="journals/example/old"><author pid="65/9612">James C. Lester</author><title>Old Work.</title><year>2021</year><journal>Old Journal</journal></article></r>
  <r><article key="journals/example/impostor"><author pid="different/pid">James C. Lester</author><title>Same Name, Different Person.</title><year>2024</year><journal>Wrong Journal</journal></article></r>
  <r><book key="books/example/c"><author pid="65/9612">James C. Lester</author><title>A Book.</title><year>2024</year></book></r>
</dblpperson>`;

describe("publication classification and parsing", () => {
  it("extracts the complete two-segment PID from DBLP profile URLs", () => {
    expect(extractPidFromDblpUrl("https://dblp.org/pid/88/4922")).toBe("88/4922");
    expect(extractPidFromDblpUrl("https://dblp.org/pid/88/4922.html")).toBe("88/4922");
    expect(extractPidFromDblpUrl(undefined)).toBeNull();
  });
  it("classifies only article and inproceedings", () => {
    expect(classifyRecordType("article")).toBe("Journal");
    expect(classifyRecordType("inproceedings")).toBe("Conference");
    expect(classifyRecordType("book")).toBeNull();
  });

  it("normalizes both single and repeated author values", () => {
    expect(normalizeAuthors({ "#text": "Jörg Test", "@_pid": "j/1" })).toEqual([{ name: "Jörg Test", pid: "j/1" }]);
    expect(normalizeAuthors(["François", { "#text": "Chen", "@_pid": "c/1" }])).toHaveLength(2);
  });

  it("includes boundary years, excludes unsupported and out-of-range records", () => {
    const result = parsePersonXml(xml, scholar, 2022, 2026);
    expect(result.rawCount).toBe(5);
    expect(result.publications).toHaveLength(2);
    expect(result.publications.map((item) => item.year)).toEqual([2026, 2022]);
    expect(result.publications[1].doi).toBe("10.1/test");
    expect(result.publications[0].rawType).toBe("inproceedings");
    expect(result.publications[0].scholarAuthorIndex).toBe(1);
    expect(result.publications[0].isFirstAuthor).toBe(false);
    expect(result.excludedPublications).toHaveLength(3);
    expect(result.excludedPublications.map((item) => item.exclusionReason)).toContain("Outside selected year range.");
    expect(result.excludedPublications.map((item) => item.exclusionReason)).toContain("DBLP record type 'book' is not counted as Journal or Conference.");
    expect(result.excludedPublications.map((item) => item.exclusionReason)).toContain("Selected scholar identity could not be verified in the author list.");
    expect(calculateStats(result.publications)).toEqual({
      journalPapers: 1, conferencePapers: 1, journalFirstAuthor: 1, conferenceFirstAuthor: 0, totalPapers: 2,
    });
  });
});

describe("deduplication", () => {
  it("keeps one publication per DBLP key", () => {
    const publication: Publication = {
      key: "same", title: "A", year: 2022, type: "Journal", rawType: "article", venue: "V",
      authors: [], eeUrls: [], isPreprint: false, scholarAuthorIndex: 0, isFirstAuthor: false, identityMatch: "pid",
      included: true, inclusionReason: "Counted", needsReview: false,
    };
    const result = deduplicatePublications([publication, { ...publication }]);
    expect(result.kept).toHaveLength(1);
    expect(result.duplicates[0].duplicateReason).toBe("same-dblp-key");
  });

  it("normalizes DOI URLs and prefixes for secondary deduplication", () => {
    expect(normalizeDoi("https://doi.org/10.1000/ABC")).toBe("10.1000/abc");
    expect(normalizeDoi("doi:10.1000/ABC")).toBe("10.1000/abc");
  });
});

describe("preprint and published-version deduplication", () => {
  const authors = [
    { name: "Noemi Mauro", pid: "123/1" },
    { name: "Zhongli Filippo Hu", pid: "123/2" },
    { name: "Liliana Ardissono", pid: "123/3" },
  ];
  function publication(overrides: Partial<Publication>): Publication {
    return {
      key: "journals/corr/Example", title: "Example.", year: 2022, type: null, rawType: "article",
      venue: "CoRR", authors, url: "https://arxiv.org/abs/1234", eeUrls: ["https://arxiv.org/abs/1234"],
      isPreprint: true, scholarAuthorIndex: 0, isFirstAuthor: false, identityMatch: "pid",
      included: false, needsReview: true, ...overrides,
    };
  }

  it("detects CoRR and arXiv from venue, key, or electronic edition URL", () => {
    expect(isPreprintPublication(publication({}))).toBe(true);
    expect(isPreprintPublication(publication({ venue: "Other", key: "x", url: undefined, eeUrls: ["https://arxiv.org/abs/x"] }))).toBe(true);
  });

  it("normalizes title punctuation, case, dashes, and HTML entities", () => {
    expect(normalizePublicationTitle("Justification of Recommender Systems Results: A Service-based Approach."))
      .toBe(normalizePublicationTitle("Justification of recommender systems results — a service-based approach"));
    expect(normalizePublicationTitle("People &amp; AI.")).toBe("people & ai");
  });

  it("keeps the formal publication and audits the CoRR version", () => {
    const preprint = publication({
      title: "Using consumer feedback from location-based services in PoI recommender systems for people with autism.",
      year: 2022,
    });
    const published = publication({
      key: "journals/eswa/Published", title: "Using consumer feedback from location-based services in PoI recommender systems for people with autism",
      year: 2023, type: "Journal", venue: "Expert Systems with Applications", url: "https://doi.org/10.1/formal",
      eeUrls: ["https://doi.org/10.1/formal"], isPreprint: false, included: true, needsReview: false,
    });
    expect(authorListsMatch(preprint.authors, published.authors)).toBe(true);
    expect(isPreprintVersionOf(preprint, published)).toBe(true);
    const result = deduplicatePublications([preprint, published]);
    expect(result.kept).toEqual([published]);
    expect(result.duplicates[0]).toMatchObject({ publication: preprint, duplicateOf: published.key, duplicateReason: "preprint-published-version" });
  });

  it("merges a 2022 CoRR version into its 2023 formal journal version", () => {
    const preprint = publication({ title: "Justification of Recommender Systems Results: A Service-based Approach.", year: 2022 });
    const journal = publication({
      key: "journals/umuai/Journal", title: "Justification of recommender systems results — a service-based approach",
      year: 2023, type: "Journal", venue: "User Modeling and User-Adapted Interaction", isPreprint: false,
      url: "https://doi.org/10.1/journal", eeUrls: ["https://doi.org/10.1/journal"], included: true, needsReview: false,
    });
    expect(deduplicatePublications([preprint, journal]).kept).toEqual([journal]);
  });

  it("does not remove a same-title record with different author PIDs", () => {
    const first = publication({ isPreprint: false, type: "Journal", venue: "Journal A", key: "a", year: 2024 });
    const second = publication({ isPreprint: false, type: "Journal", venue: "Journal A", key: "b", year: 2024, authors: [{ name: "Other", pid: "different" }] });
    expect(deduplicatePublications([first, second]).kept).toHaveLength(2);
  });
});

describe("publication audit exclusions", () => {
  it("keeps missing-year and DOI duplicate records in the audit trail", () => {
    const auditXml = `<dblpperson><author pid="65/9612">James C. Lester</author>
      <r><article key="journals/a"><author pid="65/9612">James C. Lester</author><title>Primary.</title><year>2024</year><journal>J</journal><ee>https://doi.org/10.1/DUP</ee></article></r>
      <r><article key="journals/b"><author pid="65/9612">James C. Lester</author><title>Variation.</title><year>2024</year><journal>J</journal><ee>doi:10.1/dup</ee></article></r>
      <r><article key="journals/c"><author pid="65/9612">James C. Lester</author><title>No Year.</title><journal>J</journal></article></r>
    </dblpperson>`;
    const result = parsePersonXml(auditXml, scholar, 2022, 2026);
    expect(result.publications).toHaveLength(1);
    expect(result.excludedPublications).toHaveLength(2);
    expect(result.excludedPublications.find((item) => item.key === "journals/b")).toMatchObject({
      exclusionReason: "Duplicate publication record with the same normalized DOI.", duplicateOf: "journals/a", duplicateReason: "same-doi",
    });
    expect(result.excludedPublications.find((item) => item.key === "journals/c")).toMatchObject({
      year: null, exclusionReason: "Publication year unavailable.", needsReview: true,
    });
  });
});

describe("strict scholar identity", () => {
  it("rejects the same name when PIDs differ", () => {
    expect(isSameScholar({ name: "Wei Wang", pid: "A" }, { name: "Wei Wang", pid: "B" })).toBe(false);
  });

  it("rejects different DBLP suffix identities with different PIDs", () => {
    expect(isSameScholar(
      { name: "Ning Wang 0001", pid: "A" },
      { name: "Ning Wang 0002", pid: "B" },
    )).toBe(false);
    expect(normalizeAuthorName("Ning Wang 0001")).not.toBe(normalizeAuthorName("Ning Wang 0002"));
  });

  it("accepts identical names with identical PIDs", () => {
    expect(isSameScholar({ name: "Wei Wang", pid: "A" }, { name: "Wei Wang", pid: "A" })).toBe(true);
  });

  it("accepts different name spellings when the PID is identical", () => {
    expect(isSameScholar({ name: "James Lester", pid: "A" }, { name: "James C. Lester", pid: "A" })).toBe(true);
  });

  it("does not count a same-name, different-PID first author", () => {
    const publication = { authors: [{ name: "Ning Wang", pid: "A" }] };
    expect(isSelectedScholarFirstAuthor(publication, { name: "Ning Wang", pid: "B" })).toBe(false);
  });

  it("attributes a second-author PID without marking first author", () => {
    const publication = { authors: [
      { name: "John Smith", pid: "C" },
      { name: "Ning Wang", pid: "B" },
    ] };
    const selected = { name: "Ning Wang", pid: "B" };
    expect(isSelectedScholarInPublication(publication, selected)).toBe(true);
    expect(isSelectedScholarFirstAuthor(publication, selected)).toBe(false);
  });

  it("allows an exact confirmed alias only when the author PID is missing", () => {
    const selected = { name: "James C. Lester", pid: "A", aliases: ["James Lester"] };
    expect(getIdentityMatch({ name: "James Lester" }, selected)).toBe("alias");
    expect(getIdentityMatch({ name: "James Lester", pid: "B" }, selected)).toBe("unverified");
  });

  it("does not expand initials into a full name", () => {
    expect(isSameScholar({ name: "J. Wang" }, { name: "Jing Wang", pid: "B" })).toBe(false);
  });
});
