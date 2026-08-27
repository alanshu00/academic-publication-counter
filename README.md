# Academic Publication Counter

A complete Next.js application that searches DBLP authors, retrieves a selected person's XML export, and counts journal, conference/workshop, and first-author publications for a chosen year range.

## Run locally

Requirements: Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No API key or environment variable is required.

The development configuration allows this workspace's localhost and LAN preview origins. This is required by modern Next.js development servers so client chunks load and the React search form hydrates when the preview is opened through the machine's network address.

## Validation

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

## How counts are calculated

- DBLP `article` records are classified as **Journal**.
- DBLP `inproceedings` records are classified as **Conference**, including workshop proceedings.
- Other record types (`book`, `incollection`, `proceedings`, theses, `www`, and `data`) are excluded.
- Both endpoints of the selected year range are included.
- A first-author record is one where the selected scholar is the first DBLP author. PID is the primary identity check; normalized names and DBLP aliases are used only when an author PID is absent.
- Search text is never treated as an identity, even when DBLP returns only one candidate. The user must explicitly select a PID before analysis.
- Every PID bibliography record is attributed back to the selected scholar. A different author PID always rejects the record, even when the displayed name is identical.
- Exact canonical-name or confirmed-alias fallback is allowed only when the publication author has no PID. Initial expansion and fuzzy identity matching are not used.
- Records whose attribution cannot be verified are excluded from official statistics and first-author counts.
- Duplicate records are removed by DBLP key.

## Architecture

- `app/api/search-author/route.ts` proxies the DBLP author-search JSON API.
- `app/api/publications/route.ts` fetches and parses the DBLP person XML export server-side.
- `lib/dblp.ts` handles polite requests, timeout, one retry, caching, PID paths, and XML conversion.
- `lib/publications.ts` contains reusable classification, author normalization, first-author, deduplication, and statistics logic.
- `lib/scholar-identity.ts` is the single PID-first identity and attribution-confidence implementation.
- Every DBLP person record is retained in an audit trail. Official counts include only in-range `article` and `inproceedings` records whose selected scholar identity can be verified.
- Excluded records preserve raw DBLP type, DBLP year, author position, identity match, and a specific exclusion reason.
- Duplicate counting is prevented first by DBLP key and second by normalized DOI; duplicate variants remain visible in the audit.
- CoRR/arXiv records are identified by venue, DBLP key, and electronic-edition URLs. They never count as formal journals or conferences.
- Deduplication then matches preprints to formal versions using exact normalized titles, ordered author identity matching, and a conservative 0–2 year window. The formal publication is retained.
- Non-preprint metadata duplicates require an exact normalized title, identical complete author PID sequence, raw type, and year; similar titles alone are never removed.
- The Excel workbook includes an `Audit` worksheet with counted and excluded records.
- `lib/export-excel.ts` creates Summary and Publications worksheets with SheetJS.

External DBLP requests run in the Node.js server runtime, use an 8-second timeout per host, retry a rate-limited host at most once, and fall back across the official DBLP hosts. Requests temporarily use `no-store` caching while production connectivity is diagnosed. The browser never calls DBLP directly, avoiding CORS issues. The application contains no production mock data.

## Deploy to Vercel

Import this directory into Vercel or run `vercel`. The default Next.js settings are sufficient; no environment variables are needed.

## Coverage limitation

DBLP primarily covers computer science and related fields. Its records may not represent a scholar's complete output outside DBLP coverage. Classifications reflect DBLP record types rather than title or venue inference.
