import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function check(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map(
    (v) => `${name}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

test.beforeEach(async ({ page, request }) => {
  page.on("dialog", (d) => void d.accept());
  await request.post("/api/demo/reset");
});

test("main screens have no WCAG 2.1 AA violations", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(
    page.getByText("No scenarios yet").or(page.getByRole("heading")).first(),
  ).toBeVisible();
  await check(page, "today (empty)");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Load demo day" }).click();
  await expect(page.locator('a[href^="/scenario?id="]')).toHaveCount(6);
  await check(page, "today");

  await page.goto("/scenario?id=SCN-S1");
  await expect(page.getByRole("heading", { name: "Captures (2)" })).toBeVisible();
  await check(page, "scenario");

  await page.goto("/capture");
  await expect(page.getByRole("button", { name: /Hold to talk/ })).toBeVisible();
  await check(page, "capture");

  await page.goto("/inbox");
  await expect(page.getByRole("article").first()).toBeVisible();
  await check(page, "inbox");

  await page.goto("/process");
  await expect(page.getByRole("button", { name: /^Process \d scenarios?$/ })).toBeVisible();
  await check(page, "process");

  await page.goto("/process?scenarios=SCN-S1,SCN-S2&run=1");
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible({
    timeout: 60_000,
  });
  await check(page, "review");
  await page
    .getByRole("region", { name: "Forklift near-miss, Dock 3" })
    .getByRole("button", { name: "Show details" })
    .first()
    .click();
  await page.getByRole("button", { name: /^Type/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await check(page, "evidence drawer");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Approve all" }).click();
  await page.getByRole("button", { name: /^Push \d+$/ }).click();
  await expect(page.getByRole("img", { name: /Link graph/ })).toBeVisible({ timeout: 30_000 });
  await check(page, "results");

  await page.goto("/records");
  await page.waitForLoadState("networkidle");
  await check(page, "records");

  for (const tab of ["systems", "workflows", "activity", "policy", "audit", "runs", "evals"]) {
    await page.goto(`/platform?tab=${tab}`);
    await page.waitForLoadState("networkidle");
    await check(page, `platform ${tab}`);
  }

  await page.goto("/console?server=incidents&id=INC-0009");
  await expect(page.getByRole("heading", { name: /Near miss: FL-07/ })).toBeVisible();
  await check(page, "console");
});
