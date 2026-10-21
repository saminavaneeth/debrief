import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  page.on("dialog", (d) => void d.accept());
  await request.post("/api/demo/reset");
});

test("presenter: script drives the phone, records open in the console pane", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/present");
  const phone = page.frameLocator('iframe[title="Debrief capture app at phone size"]');
  const side = page.frameLocator('iframe[title="EHS systems"]');

  await expect(page.getByRole("button", { name: /A day in the field/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.getByRole("button", { name: "Load demo day" }).click();
  await expect(page.getByRole("status")).toHaveText("Demo day loaded");
  await expect(phone.locator('a[href^="/scenario?id="]')).toHaveCount(6);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);

  // Opening a step moves both panes.
  await page.getByRole("button", { name: /Plug in a system/ }).click();
  await side.getByRole("switch", { name: "Connect Training" }).click();
  await expect(side.getByRole("switch", { name: "Connect Training" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Process and push one scenario in the phone.
  await page.locator('iframe[title="Debrief capture app at phone size"]').evaluate((f) => {
    (f as HTMLIFrameElement).contentWindow!.location.assign("/process?scenarios=SCN-S1&run=1");
  });
  await expect(phone.getByRole("heading", { name: "Proposed changes" })).toBeVisible({
    timeout: 60_000,
  });
  await phone.getByLabel("Who was operating FL-07?").selectOption("P-005");
  await phone.getByRole("button", { name: "Approve all" }).click();
  await phone.getByRole("button", { name: /^Push \d+$/ }).click();
  await expect(phone.getByRole("img", { name: /Link graph/ })).toBeVisible({ timeout: 30_000 });

  // A record link in the phone opens in the side pane; the phone stays on Results.
  await phone
    .getByRole("listitem")
    .getByRole("link", { name: /^INC-\d{4} Near miss: FL-07/ })
    .click();
  await expect(side.getByRole("heading", { name: /Near miss: FL-07/ })).toBeVisible();
  await expect(phone.getByRole("img", { name: /Link graph/ })).toBeVisible();

  // Reset puts everything back.
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByRole("status")).toHaveText("Demo reset");
  await expect(phone.locator('a[href^="/scenario?id="]')).toHaveCount(0);
});

test("presenter screenshot", async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");
  const out = process.env.SCREENSHOTS_DIR ?? "test-results/screens";
  await page.goto("/present");
  await page.getByRole("button", { name: "Load demo day" }).click();
  const phone = page.frameLocator('iframe[title="Debrief capture app at phone size"]');
  await expect(phone.locator('a[href^="/scenario?id="]')).toHaveCount(6);
  await page.getByRole("button", { name: /Review the change set/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/30-presenter.png` });
});
