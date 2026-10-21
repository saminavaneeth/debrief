import { test } from "@playwright/test";

/** Visual check of the main screens. Run with: SCREENSHOTS=1 npx playwright test screenshots */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture screenshots");

test("capture app screens", async ({ page }) => {
  const out = process.env.SCREENSHOTS_DIR ?? "test-results/screens";
  page.on("dialog", (d) => void d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Load demo day" }).click();
  await page.locator('a[href^="/scenario?id="]').first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/01-today.png`, fullPage: true });

  await page.goto("/scenario?id=SCN-S1");
  await page.getByRole("heading", { name: "Captures (2)" }).waitFor();
  await page.screenshot({ path: `${out}/02-scenario.png`, fullPage: true });

  await page.goto("/capture");
  await page.getByRole("button", { name: /Hold to talk/ }).waitFor();
  await page.screenshot({ path: `${out}/03-capture.png` });

  await page.getByRole("button", { name: "Edit capture" }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/04-editor.png` });
  await page.keyboard.press("Escape");

  await page.goto("/inbox");
  await page.getByRole("article").first().waitFor();
  await page.screenshot({ path: `${out}/05-inbox.png` });

  await page.goto("/scenario?id=SCN-S5");
  await page.getByRole("img", { name: /Video keyframe/ }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/06-video.png`, fullPage: true });
});

test("agent screens", async ({ page, request }) => {
  const out = process.env.SCREENSHOTS_DIR ?? "test-results/screens";
  page.on("dialog", (d) => void d.accept());
  await request.post("/api/demo/reset");
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Load demo day" }).click();
  await page.locator('a[href^="/scenario?id="]').first().waitFor();
  await page.goto("/process");
  await page.getByRole("button", { name: /^Process \d scenarios?$/ }).waitFor();
  await page.screenshot({ path: `${out}/10-process.png`, fullPage: true });
  await page.getByRole("button", { name: /^Process \d scenarios?$/ }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/11-trace.png` });
  await page.waitForURL(/\/review\?cs=/, { timeout: 60_000 });
  await page.getByRole("heading", { name: "Proposed changes" }).waitFor();
  await page.screenshot({ path: `${out}/12-review.png`, fullPage: true });
  const s2 = page.getByRole("region", { name: "Slip in break room" });
  await s2.getByRole("button", { name: "Show details" }).first().click();
  await s2.getByRole("button", { name: /^OSHA recordable/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/13-evidence.png` });
  await page.keyboard.press("Escape");
  const s1 = page.getByRole("region", { name: "Forklift near-miss, Dock 3" });
  await s1.getByRole("button", { name: "Show details" }).first().click();
  await s1.getByRole("button", { name: /^Type/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/14-evidence-photo.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Approve all" }).click();
  await page.getByRole("button", { name: /^Push \d+$/ }).click();
  await page.waitForURL(/\/results\?cs=/, { timeout: 60_000 });
  await page.getByRole("img", { name: /Link graph/ }).waitFor();
  await page.screenshot({ path: `${out}/15-results.png`, fullPage: true });
});

test("platform screens", async ({ page, request }) => {
  test.setTimeout(120_000);
  const out = process.env.SCREENSHOTS_DIR ?? "test-results/screens";
  page.on("dialog", (d) => void d.accept());
  await request.post("/api/demo/reset");
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Load demo day" }).click();
  await page.locator('a[href^="/scenario?id="]').first().waitFor();
  await page.goto("/process?scenarios=SCN-S1,SCN-S2&run=1");
  await page.waitForURL(/\/review\?cs=/, { timeout: 60_000 });
  await page.getByRole("button", { name: "Approve all" }).click();
  await page.getByRole("button", { name: /^Push \d+$/ }).click();
  await page.waitForURL(/\/results\?cs=/, { timeout: 60_000 });
  await page.getByRole("heading", { name: "Workflows" }).waitFor();
  await page.screenshot({ path: `${out}/20-results-workflows.png`, fullPage: true });
  await page.goto("/platform?tab=systems");
  await page.getByRole("switch", { name: "Connect Training" }).waitFor();
  await page.screenshot({ path: `${out}/21-systems.png`, fullPage: true });
  await page.goto("/platform?tab=workflows");
  await page.getByRole("button", { name: "Find patterns" }).click();
  await page.getByText(/Flag new incidents involving FL-07/).waitFor();
  await page.screenshot({ path: `${out}/22-workflows.png`, fullPage: true });
  await page.goto("/platform?tab=activity");
  await page.getByText("Schedule an audit of Dock 3", { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/23-activity.png`, fullPage: true });
  await page.goto("/platform?tab=evals");
  await page.getByRole("button", { name: "Run evals" }).click();
  await page.getByText(/cases fully correct/).waitFor({ timeout: 60_000 });
  await page.screenshot({ path: `${out}/24-evals.png`, fullPage: true });
});
