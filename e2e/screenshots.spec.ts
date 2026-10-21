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
