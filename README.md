# Academic Publication Counter

A Next.js application that searches DBLP authors in the browser and counts journal, conference/workshop, and first-author publications for a chosen year range.

## Run locally

Requirements: Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No API key or environment variable is required.

## Validation

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

## How counts are calculated

- DBLP Search API records whose `info.type` is `Journal Articles` are classified as **Journal**.
- Records whose `info.type` is `Conference and Workshop Papers` are classified as **Conference**.
- Informal publications, books, theses, and editorship records are excluded.
- Both endpoints of the selected year range are included.
- Search text is never treated as an identity. The user must explicitly select a candidate with a DBLP PID.
- A publication is attributed only when an author `@pid` exactly matches the selected PID. A missing or different PID excludes the record even when the displayed name is identical.
- A first-author record requires the selected PID to match the first DBLP author PID.
- Records whose attribution cannot be verified are retained in the audit but excluded from official statistics.
- Duplicate detection uses DBLP key, normalized DOI, preprint-to-published matching, and conservative high-confidence metadata matching.
- CoRR/arXiv records never count as formal journal or conference publications.

## Architecture

- `lib/jsonp.ts` safely loads JSONP only from the trusted `https://dblp.org` origin, with unique callbacks, cleanup, error handling, and timeout handling.
- `lib/dblp-client.ts` performs browser-side author and publication searches, serial pagination, Search API normalization, PID post-filtering, classification, and audit construction.
- Candidate cards use only the single author-search response; selecting a candidate triggers publication retrieval.
- `lib/publications.ts` contains reusable deduplication, preprint detection, and statistics logic.
- `lib/scholar-identity.ts` provides conservative PID and name normalization helpers.
- `lib/export-excel.ts` creates Summary, Publications, and Audit worksheets with SheetJS.

External DBLP requests use the Search API's `format=jsonp` mode and are loaded directly by the browser, so Vercel does not proxy DBLP traffic. Author search requests at most 20 candidates. Publication requests retrieve up to 1000 results per page and paginate serially with a 1.5-second delay only when necessary. No API key or production mock data is used.

## Deploy to Vercel

Import this directory into Vercel or run `vercel`. The default Next.js settings are sufficient; no environment variables are needed.

## Coverage limitation

DBLP primarily covers computer science and related fields. Its records may not represent a scholar's complete output outside DBLP coverage. Classifications reflect DBLP Search API types rather than title or venue inference.
