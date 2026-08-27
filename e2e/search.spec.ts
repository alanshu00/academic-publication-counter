import { expect, test, type Page, type Route } from "@playwright/test";

const jamesCandidates = [
  { name: "Lester James V. Miranda", pid: "224/9490", url: "https://dblp.org/pid/224/9490" },
  { name: "James C. Lester", pid: "88/4922", url: "https://dblp.org/pid/88/4922" },
  { name: "James M. Lester", pid: "80/3596", url: "https://dblp.org/pid/80/3596" },
];

function jsonpBody(route: Route, payload: unknown): string {
  const callback = new URL(route.request().url()).searchParams.get("callback");
  if (!callback) throw new Error("Expected a JSONP callback parameter");
  return `${callback}(${JSON.stringify(payload)});`;
}

async function mockAuthorSearch(page: Page, candidates = jamesCandidates) {
  await page.route("https://dblp.org/search/author/api?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      contentType: "application/javascript; charset=utf-8",
      body: jsonpBody(route, {
        result: {
          status: { "@code": "200", text: "OK" },
          hits: {
            "@total": String(candidates.length),
            "@sent": String(candidates.length),
            hit: candidates.map((candidate) => ({ info: {
              author: candidate.name,
              url: candidate.url,
            } })),
          },
        },
      }),
    });
  });
}

async function mockPublicationSearch(page: Page) {
  await page.route("https://dblp.org/search/publ/api?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript; charset=utf-8",
      body: jsonpBody(route, {
        result: {
          status: { "@code": "200", text: "OK" },
          hits: { "@total": "1", "@sent": "1", hit: {
            info: {
              authors: { author: { "@pid": "88/4922", text: "James C. Lester" } },
              title: "A Browser-Side DBLP Result.",
              venue: "Example Journal",
              year: "2024",
              type: "Journal Articles",
              key: "journals/example/browser",
              url: "https://dblp.org/rec/journals/example/browser",
            },
          } },
        },
      }),
    });
  });
}

test("search and analysis use browser-side DBLP JSONP", async ({ page }) => {
  await mockAuthorSearch(page);
  await mockPublicationSearch(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await page.getByLabel("Scholar name").fill("James Lester");
  await page.getByRole("spinbutton", { name: "From", exact: true }).fill("2022");
  await page.getByRole("spinbutton", { name: "To", exact: true }).fill("2026");
  const authorRequest = page.waitForRequest((request) =>
    request.url().startsWith("https://dblp.org/search/author/api?"),
  );
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.getByRole("button", { name: /Searching DBLP/ })).toBeDisabled();
  const authorUrl = new URL((await authorRequest).url());
  expect(authorUrl.searchParams.get("format")).toBe("jsonp");
  expect(authorUrl.searchParams.get("callback")).toMatch(/^__dblpJsonp_/);
  expect(authorUrl.searchParams.get("h")).toBe("20");
  await expect(page.getByRole("heading", { name: "Select the correct scholar" })).toBeVisible();

  const jamesCard = page.locator(".candidate-card").filter({ hasText: "James C. Lester" });
  const publicationRequest = page.waitForRequest((request) =>
    request.url().startsWith("https://dblp.org/search/publ/api?"),
  );
  await jamesCard.getByRole("button", { name: "Select" }).click();
  const publicationUrl = new URL((await publicationRequest).url());
  expect(publicationUrl.searchParams.get("q")).toBe("author:James_C._Lester:");
  expect(publicationUrl.searchParams.get("format")).toBe("jsonp");
  expect(publicationUrl.searchParams.get("h")).toBe("1000");
  await expect(page.getByText("Selected scholar", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "James C. Lester" })).toBeVisible();
  await expect(page.getByText("A Browser-Side DBLP Result.", { exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("Ning Wang returns multiple candidates without auto-selecting", async ({ page }) => {
  await mockAuthorSearch(page, [
    { name: "Ning Wang 0001", pid: "12/1", url: "https://dblp.org/pid/12/1" },
    { name: "Ning Wang 0002", pid: "12/2", url: "https://dblp.org/pid/12/2" },
  ]);
  await page.goto("/");
  await page.getByLabel("Scholar name").fill("Ning Wang");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.getByRole("heading", { name: "Select the correct scholar" })).toBeVisible();
  expect(await page.locator(".candidate-card").count()).toBe(2);
  await expect(page.getByText("Selected scholar", { exact: true })).toHaveCount(0);
});

test("a nonexistent name shows a visible no-result error", async ({ page }) => {
  await mockAuthorSearch(page, []);
  await page.goto("/");
  await page.getByLabel("Scholar name").fill("zzzzzzzzzzexample999");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.locator(".error-banner")).toHaveText(/No scholar found on DBLP/);
});

test("blank and invalid-year validation send no DBLP request", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("dblp.org/search/")) requests += 1;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.locator(".error-banner")).toHaveText(/Please enter a scholar name/);
  expect(requests).toBe(0);

  await page.getByLabel("Scholar name").fill("James Lester");
  await page.getByRole("spinbutton", { name: "From", exact: true }).fill("2026");
  await page.getByRole("spinbutton", { name: "To", exact: true }).fill("2022");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.locator(".error-banner")).toHaveText(/From year cannot be later than To year/);
  expect(requests).toBe(0);
});

test("live browser integration searches DBLP without a Vercel API route", async ({ page }) => {
  test.skip(process.env.RUN_DBLP_INTEGRATION !== "1", "Run explicitly to avoid repeatedly querying DBLP.");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await page.getByLabel("Scholar name").fill("James Lester");
  await page.getByRole("button", { name: "Search scholar" }).click();
  await expect(page.getByText("James C. Lester", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(requests.some((url) => url.startsWith("https://dblp.org/search/author/api?"))).toBe(true);
  expect(requests.some((url) => url.includes("/api/search-author"))).toBe(false);
});
