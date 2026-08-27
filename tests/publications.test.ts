import { describe, expect, it } from "vitest";
import {
  buildDblpAuthorQueryToken,
  classifySearchApiType,
  extractPidFromDblpUrl,
  normalizeSearchApiAuthors,
  parseAuthorSearchResponse,
  parsePublicationSearchResponse,
} from "@/lib/dblp-client";
import {
  authorListsMatch,
  calculateStats,
  deduplicatePublications,
  isPreprintPublication,
  isPreprintVersionOf,
  normalizeDoi,
  normalizePublicationTitle,
} from "@/lib/publications";
import {
  getIdentityMatch,
  isSameScholar,
  isSelectedScholarFirstAuthor,
  normalizeAuthorName,
} from "@/lib/scholar-identity";
import type { Publication, Scholar } from "@/types";

const scholar: Scholar = {
  name: "James C. Lester",
  pid: "65/9612",
  aliases: ["James Lester"],
};

function searchHit(overrides: Record<string, unknown>) {
  return {
    info: {
      key: "journals/example/default",
      title: "Example publication.",
      year: "2024",
      venue: "Example Venue",
      type: "Journal Articles",
      authors: { author: { text: "James C. Lester", "@pid": "65/9612" } },
      ...overrides,
    },
  };
}

describe("DBLP JSONP normalization", () => {
  it("extracts slash-separated PIDs from DBLP profile URLs", () => {
    expect(extractPidFromDblpUrl("https://dblp.org/pid/88/4922")).toBe("88/4922");
    expect(extractPidFromDblpUrl("https://dblp.org/pid/88/4922.html")).toBe("88/4922");
    expect(extractPidFromDblpUrl(undefined)).toBeNull();
  });

  it("preserves Unicode and initials in publication query tokens", () => {
    expect(buildDblpAuthorQueryToken("René F. Kizilcec")).toBe("author:René_F._Kizilcec:");
    expect(buildDblpAuthorQueryToken("François Gauthier")).toBe("author:François_Gauthier:");
  });

  it("parses candidates without losing PID, aliases, notes, or Unicode", () => {
    const result = parseAuthorSearchResponse({
      result: {
        status: { "@code": "200" },
        hits: { hit: { info: {
          author: "René F. Kizilcec",
          url: "https://dblp.org/pid/127/7170",
          aliases: { alias: "René Kizilcec" },
          notes: { note: { text: "Cornell University" } },
        } } },
      },
    });
    expect(result).toEqual([{
      name: "René F. Kizilcec",
      pid: "127/7170",
      url: "https://dblp.org/pid/127/7170.html",
      aliases: ["René Kizilcec"],
      note: "Cornell University",
    }]);
  });

  it("normalizes both object and array author shapes", () => {
    expect(normalizeSearchApiAuthors({ text: "Jörg Test", "@pid": "j/1" }))
      .toEqual([{ name: "Jörg Test", pid: "j/1" }]);
    expect(normalizeSearchApiAuthors(["François", { text: "Chen", "@pid": "c/1" }]))
      .toEqual([{ name: "François" }, { name: "Chen", pid: "c/1" }]);
  });
});

describe("Search API publication classification and strict identity", () => {
  it("uses DBLP info.type instead of XML element names", () => {
    expect(classifySearchApiType("Journal Articles")).toBe("Journal");
    expect(classifySearchApiType("Conference and Workshop Papers")).toBe("Conference");
    expect(classifySearchApiType("Informal and Other Publications")).toBeNull();
    expect(classifySearchApiType("Books and Theses")).toBeNull();
  });

  it("counts boundary years and audits unsupported, old, and PID-mismatched records", () => {
    const result = parsePublicationSearchResponse([
      searchHit({ key: "journals/example/a", title: "Journal Work.", year: "2022", doi: "10.1/test" }),
      searchHit({
        key: "conf/example/b",
        title: "Conference Work.",
        year: "2026",
        type: "Conference and Workshop Papers",
        authors: { author: [
          { text: "Other Author", "@pid": "x/1" },
          { text: "James C. Lester", "@pid": "65/9612" },
        ] },
      }),
      searchHit({ key: "journals/example/old", year: "2021" }),
      searchHit({
        key: "journals/example/impostor",
        authors: { author: { text: "James C. Lester", "@pid": "different/pid" } },
      }),
      searchHit({ key: "books/example/c", type: "Books and Theses" }),
    ], scholar, 2022, 2026);

    expect(result.rawCount).toBe(5);
    expect(result.publications).toHaveLength(2);
    expect(result.publications.map((item) => item.year)).toEqual([2026, 2022]);
    expect(result.publications[0]).toMatchObject({
      type: "Conference",
      rawType: "Conference and Workshop Papers",
      scholarAuthorIndex: 1,
      isFirstAuthor: false,
    });
    expect(result.publications[1]).toMatchObject({ doi: "10.1/test", isFirstAuthor: true });
    expect(result.excludedPublications.map((item) => item.exclusionReason)).toEqual(expect.arrayContaining([
      "Outside selected year range.",
      "Selected scholar PID was not found in the DBLP author list.",
      "DBLP classifies this record as Books and Theses.",
    ]));
    expect(calculateStats(result.publications)).toEqual({
      journalPapers: 1,
      conferencePapers: 1,
      journalFirstAuthor: 1,
      conferenceFirstAuthor: 0,
      totalPapers: 2,
    });
  });

  it("never counts a same-name record with a different PID", () => {
    const result = parsePublicationSearchResponse([
      searchHit({ authors: { author: { text: "James C. Lester", "@pid": "other/pid" } } }),
    ], scholar, 2022, 2026);
    expect(result.publications).toHaveLength(0);
    expect(result.excludedPublications[0]).toMatchObject({
      identityMatch: "unverified",
      scholarAuthorIndex: null,
      isFirstAuthor: false,
    });
  });
});

describe("preprints and duplicate detection", () => {
  const authors = [
    { name: "Noemi Mauro", pid: "123/1" },
    { name: "Zhongli Filippo Hu", pid: "123/2" },
    { name: "Liliana Ardissono", pid: "123/3" },
  ];
  function publication(overrides: Partial<Publication>): Publication {
    return {
      key: "journals/corr/Example",
      title: "Example.",
      year: 2022,
      type: null,
      rawType: "Informal and Other Publications",
      venue: "CoRR",
      authors,
      url: "https://arxiv.org/abs/1234",
      eeUrls: ["https://arxiv.org/abs/1234"],
      isPreprint: true,
      scholarAuthorIndex: 0,
      isFirstAuthor: false,
      identityMatch: "pid",
      included: false,
      needsReview: true,
      ...overrides,
    };
  }

  it("detects CoRR/arXiv and prefers a formal publication with matching metadata", () => {
    const preprint = publication({
      title: "Using consumer feedback from location-based services in PoI recommender systems for people with autism.",
      year: 2022,
    });
    const formal = publication({
      key: "journals/eswa/Published",
      title: "Using consumer feedback from location-based services in PoI recommender systems for people with autism",
      year: 2023,
      type: "Journal",
      rawType: "Journal Articles",
      venue: "Expert Systems with Applications",
      url: "https://doi.org/10.1/formal",
      eeUrls: ["https://doi.org/10.1/formal"],
      isPreprint: false,
      included: true,
      needsReview: false,
    });
    expect(isPreprintPublication(preprint)).toBe(true);
    expect(authorListsMatch(preprint.authors, formal.authors)).toBe(true);
    expect(isPreprintVersionOf(preprint, formal)).toBe(true);
    const result = deduplicatePublications([preprint, formal]);
    expect(result.kept).toEqual([formal]);
    expect(result.duplicates[0]).toMatchObject({
      publication: preprint,
      duplicateOf: formal.key,
      duplicateReason: "preprint-published-version",
    });
  });

  it("keeps the Noemi Mauro formal journal and audits the CoRR version", () => {
    const selected: Scholar = { name: "Noemi Mauro", pid: "123/1" };
    const apiAuthors = { author: authors.map((author) => ({ text: author.name, "@pid": author.pid })) };
    const result = parsePublicationSearchResponse([
      searchHit({
        key: "journals/corr/Noemi",
        title: "Using consumer feedback from location-based services in PoI recommender systems for people with autism.",
        year: "2022",
        venue: "CoRR",
        type: "Informal and Other Publications",
        ee: "https://arxiv.org/abs/example",
        authors: apiAuthors,
      }),
      searchHit({
        key: "journals/eswa/Noemi",
        title: "Using consumer feedback from location-based services in PoI recommender systems for people with autism",
        year: "2023",
        venue: "Expert Systems with Applications",
        type: "Journal Articles",
        authors: apiAuthors,
      }),
    ], selected, 2022, 2026);
    expect(result.publications).toHaveLength(1);
    expect(result.publications[0]).toMatchObject({ type: "Journal", venue: "Expert Systems with Applications" });
    expect(result.excludedPublications[0]).toMatchObject({
      venue: "CoRR",
      duplicateReason: "preprint-published-version",
    });
  });

  it("normalizes titles and DOI values for duplicate checks", () => {
    expect(normalizePublicationTitle("People &amp; AI.")).toBe("people & ai");
    expect(normalizeDoi("https://doi.org/10.1000/ABC")).toBe("10.1000/abc");
    expect(normalizeDoi("doi:10.1000/ABC")).toBe("10.1000/abc");
  });
});

describe("strict scholar identity helpers", () => {
  it("rejects identical names when PIDs differ", () => {
    expect(isSameScholar({ name: "Wei Wang", pid: "A" }, { name: "Wei Wang", pid: "B" })).toBe(false);
  });

  it("preserves DBLP numeric suffix identities", () => {
    expect(normalizeAuthorName("Ning Wang 0001")).not.toBe(normalizeAuthorName("Ning Wang 0002"));
  });

  it("uses an identical PID across display-name variants", () => {
    expect(isSameScholar({ name: "James Lester", pid: "A" }, { name: "James C. Lester", pid: "A" })).toBe(true);
  });

  it("does not mark a same-name, different-PID author as first author", () => {
    expect(isSelectedScholarFirstAuthor(
      { authors: [{ name: "Ning Wang", pid: "A" }] },
      { name: "Ning Wang", pid: "B" },
    )).toBe(false);
  });

  it("uses aliases only when the publication author PID is missing", () => {
    const selected = { name: "James C. Lester", pid: "A", aliases: ["James Lester"] };
    expect(getIdentityMatch({ name: "James Lester" }, selected)).toBe("alias");
    expect(getIdentityMatch({ name: "James Lester", pid: "B" }, selected)).toBe("unverified");
  });
});
