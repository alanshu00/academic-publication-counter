import { expect, test } from "@playwright/test";

const jamesCandidates = [
  { name: "Lester James V. Miranda", pid: "224/9490", url: "https://dblp.org/pid/224/9490.html", aliases: [] },
  { name: "James C. Lester", pid: "88/4922", url: "https://dblp.org/pid/88/4922.html", aliases: [] },
  { name: "James M. Lester", pid: "80/3596", url: "https://dblp.org/pid/80/3596.html", aliases: [] },
];

async function mockSearch(page: import("@playwright/test").Page, scholars: typeof jamesCandidates) {
  await page.route("**/api/search-author?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, scholars }) });
  });
}

test("search submits to the local API and renders candidates", async ({ page }) => {
  await mockSearch(page, jamesCandidates);
  await page.route("**/api/publications?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      scholar: jamesCandidates[1],
      period: { from: 2022, to: 2026 },
      stats: { journalPapers: 0, conferencePapers: 0, journalFirstAuthor: 0, conferenceFirstAuthor: 0, totalPapers: 0 },
      publications: [],
      excludedPublications: [],
      auditSummary: { countedRecords: 0, excludedRecords: 0, needsReview: 0, duplicateRecordsRemoved: 0, preprintsExcluded: 0, otherExcluded: 0 },
      countsByYear: [],
      lastChecked: new Date().toISOString(),
    }),
  }));
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`${message.text()} ${message.location().url}`.trim());
    }
  });
  await page.goto("/");
  await page.getByLabel("Scholar name").fill("James Lester");
  await page.getByRole("spinbutton", { name: "From", exact: true }).fill("2022");
  await page.getByRole("spinbutton", { name: "To", exact: true }).fill("2026");
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/search-author?name=James%20Lester"),
  );
  const searchButton = page.getByRole("button", { name: "Search scholar" });
  await searchButton.click();
  await expect(page.getByRole("button", { name: /Searching DBLP/ })).toBeDisabled();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Select the correct scholar" })).toBeVisible();
  await expect(page.getByText("James C. Lester", { exact: true })).toBeVisible();

  const jamesCard = page.locator(".candidate-card").filter({ hasText: "James C. Lester" });
  const analysisResponse = page.waitForResponse((candidate) => candidate.url().includes("/api/publications?"));
  await jamesCard.getByRole("button", { name: "Select" }).click();
  expect((await analysisResponse).status()).toBe(200);
  await expect(page.getByText("Selected scholar", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "James C. Lester" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("Ning Wang returns multiple candidates without auto-selecting", async ({ page }) => {
  const ningCandidates = [
    { name: "Ning Wang 0001", pid: "12/1", url: "https://dblp.org/pid/12/1.html", aliases: [] },
    { name: "Ning Wang 0002", pid: "12/2", url: "https://dblp.org/pid/12/2.html", aliases: [] },
  ];
  await mockSearch(page, ningCandidates);
  await page.route("**/api/publications?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    success: true, scholar: ningCandidates[0], period: { from: 2022, to: 2026 },
    stats: { journalPapers: 0, conferencePapers: 0, journalFirstAuthor: 0, conferenceFirstAuthor: 0, totalPapers: 0 },
    publications: [], excludedPublications: [], auditSummary: { countedRecords: 0, excludedRecords: 0, needsReview: 0, duplicateRecordsRemoved: 0, preprintsExcluded: 0, otherExcluded: 0 }, countsByYear: [], lastChecked: new Date().toISOString(),
  }) }));
  await page.goto("/");
  await page.getByLabel("Scholar name").fill("Ning Wang");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.getByRole("heading", { name: "Select the correct scholar" })).toBeVisible();
  const candidateCount = await page.locator(".candidate-card").count();
  expect(candidateCount).toBeGreaterThan(1);
  await expect(page.getByText("Selected scholar", { exact: true })).toHaveCount(0);
});

test("a nonexistent name shows a visible no-result error", async ({ page }) => {
  await mockSearch(page, []);
  await page.goto("/");
  await page.getByLabel("Scholar name").fill("zzzzzzzzzzexample999");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.locator(".error-banner")).toHaveText(/No scholar found on DBLP/);
});

test("blank scholar validation does not send a request", async ({ page }) => {
  let searchRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/search-author")) searchRequests += 1;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.locator(".error-banner")).toHaveText(/Please enter a scholar name/);
  expect(searchRequests).toBe(0);
});

test("invalid year order shows validation without searching", async ({ page }) => {
  let searchRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/search-author")) searchRequests += 1;
  });
  await page.goto("/");
  await page.getByLabel("Scholar name").fill("James Lester");
  await page.getByRole("spinbutton", { name: "From", exact: true }).fill("2026");
  await page.getByRole("spinbutton", { name: "To", exact: true }).fill("2022");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.locator(".error-banner")).toHaveText(/From year cannot be later than To year/);
  expect(searchRequests).toBe(0);
});

test("search API can be opened directly and returns valid JSON", async ({ request }) => {
  test.skip(process.env.RUN_DBLP_INTEGRATION !== "1", "Run explicitly to avoid repeatedly querying DBLP.");
  const response = await request.get("/api/search-author?name=James%20Lester");
  expect(response.status()).toBe(200);
  const body = await response.json() as { success: boolean; scholars: Array<{ name: string; pid: string | null }> };
  expect(body.success).toBe(true);
  expect(body.scholars.some((scholar) => scholar.name === "James C. Lester" && scholar.pid === "88/4922")).toBe(true);
});
