import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

/* A 1×1 PNG and the demo checklist PDF as upload fixtures. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = fs.readFileSync(
  path.join(process.cwd(), "public/demo-assets/s4/extinguisher-checklist.pdf"),
);

async function openToday(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function menu(page: Page, item: string) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function addNote(page: Page, text: string) {
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByPlaceholder("What did you see?").fill(text);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function finishEditor(page: Page, heading: string) {
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: heading })).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
});

test("load demo day: six scenarios, one Inbox capture, demo media", async ({ page }) => {
  await openToday(page);
  await menu(page, "Load demo day");

  const cards = page.locator('a[href^="/scenario?id="]');
  await expect(cards).toHaveCount(6);
  await expect(page.locator('a[href="/inbox"]').first()).toContainText("1");
  await expect(page.getByText("V-22 dripping at the tank farm")).toBeVisible();

  await page.getByRole("link", { name: /Forklift near-miss, Dock 3/ }).click();
  await expect(page).toHaveURL(/scenario\?id=SCN-S1/);
  await expect(page.getByRole("heading", { name: "Captures (2)" })).toBeVisible();
  await expect(page.getByText(/FL-07 was reversing out of door two/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Play voice note" })).toBeVisible();
  const photo = page.locator('img[src="/demo-assets/s1/mirror.svg"]');
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.goto("/scenario?id=SCN-S5");
  await expect(page.getByRole("img", { name: /Video keyframe at 0:00/ })).toBeVisible();
  await page.getByRole("button", { name: "Keyframe at 0:09" }).click();
  await expect(page.getByRole("img", { name: /Video keyframe at 0:09/ })).toBeVisible();

  await page.goto("/scenario?id=SCN-S4");
  await expect(page.getByRole("link", { name: /extinguisher-checklist\.pdf/ })).toBeVisible();
});

test("all five capture types save to the device and survive a reload", async ({ page }) => {
  await page.goto("/capture");
  await expect(page.getByLabel("Saving to")).toHaveValue("");

  await addNote(page, "Pallet wrap debris near Dock 2 door.");

  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles({ name: "puddle.png", mimeType: "image/png", buffer: PNG });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Photo details" })).toBeVisible();
  await sheet.getByLabel("Caption").fill("Debris by the door");
  await sheet.getByLabel("Area").selectOption("plant-1.dock-2");
  await sheet.getByLabel("Asset tag").fill("fl-03");
  await sheet.getByRole("button", { name: "Slips, trips & walking surfaces" }).click();
  await finishEditor(page, "Photo details");

  await page.locator('input[type="file"][accept="video/*"]').setInputFiles({
    name: "walk.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("not really a video"),
  });
  await finishEditor(page, "Video details");

  await page
    .locator('input[type="file"][accept="application/pdf,image/*"]')
    .setInputFiles({ name: "checklist.pdf", mimeType: "application/pdf", buffer: PDF });
  await finishEditor(page, "Document details");

  // Voice: hold the button with the fake microphone running.
  const talk = page.getByRole("button", { name: /Hold to talk/ });
  await talk.scrollIntoViewIfNeeded();
  const box = (await talk.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await page.waitForTimeout(1600);
  await page.mouse.up();
  await expect(sheet.getByRole("heading", { name: "Voice details" })).toBeVisible();
  await sheet.getByLabel("Transcript").fill("Checked Dock 2, debris cleared by the crew.");
  await finishEditor(page, "Voice details");

  await page.reload();
  const recent = page.getByRole("region", { name: "Recent captures" }).getByRole("article");
  await expect(recent).toHaveCount(5);
  for (const label of ["Voice", "Document", "Video", "Photo", "Note"]) {
    await expect(page.getByText(new RegExp(`^${label} · \\d\\d:\\d\\d$`))).toBeVisible();
  }
  await expect(page.getByText("Debris by the door")).toBeVisible();
  await expect(page.getByText("Plant 1 · Dock 2 · FL-03")).toBeVisible();
  await expect(page.getByText("Slips, trips & walking surfaces")).toBeVisible();
  await expect(page.locator('audio[src^="blob:"]')).toHaveCount(1);
  await expect(page.locator('video[src^="blob:"]')).toHaveCount(1);

  await page.goto("/inbox");
  await expect(page.getByRole("article")).toHaveCount(5);
});

test("group captures: new scenario from Inbox, rename, split, merge, move", async ({ page }) => {
  await page.goto("/capture");
  await addNote(page, "First: leaking hose at Line A station 6.");
  await addNote(page, "Second: hose reel installed, leak stopped.");

  await page.goto("/inbox");
  const checks = page.getByRole("checkbox");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole("button", { name: "New scenario" }).click();
  await expect(page).toHaveURL(/scenario\?id=SCN-/);
  await expect(page.getByRole("heading", { name: "Captures (2)" })).toBeVisible();

  await page.getByRole("button", { name: /^New scenario \d\d:\d\d$/ }).click();
  await page.getByLabel("Scenario title").fill("Line A hose leak");
  await page.getByLabel("Scenario title").press("Enter");
  await expect(page.getByRole("button", { name: "Line A hose leak" })).toBeVisible();

  await page.getByRole("button", { name: "Scenario actions" }).click();
  await page.getByRole("menuitem", { name: "Split captures" }).click();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: /Split 1 into a new scenario/ }).click();
  await expect(page.getByRole("button", { name: "Line A hose leak (split)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Captures (1)" })).toBeVisible();

  await page.getByRole("button", { name: "Scenario actions" }).click();
  await page.getByRole("menuitem", { name: "Merge into…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Line A hose leak" }).click();
  await expect(page.getByRole("button", { name: "Line A hose leak" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Captures (2)" })).toBeVisible();

  await page.getByRole("button", { name: "Move capture" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Inbox" }).click();
  await expect(page.getByRole("heading", { name: "Captures (1)" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Captures (1)" })).toBeVisible();
  await openToday(page);
  await expect(page.locator('a[href^="/scenario?id="]')).toHaveCount(1);
  await expect(page.locator('a[href="/inbox"]').first()).toContainText("1");
});

test("works offline after the first visit", async ({ page, context }) => {
  await openToday(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForFunction(async () => {
    const cache = await caches.open("debrief-shell-v2");
    const keys = (await cache.keys()).map((r) => new URL(r.url).pathname);
    return ["/", "/capture", "/inbox", "/scenario", "/platform"].every((p) => keys.includes(p));
  });
  await menu(page, "Load demo day");
  await expect(page.locator('a[href^="/scenario?id="]')).toHaveCount(6);
  await page.waitForTimeout(500); // let the demo asset prefetch land in the cache

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/^Offline\./)).toBeVisible();
  await expect(page.locator('a[href^="/scenario?id="]')).toHaveCount(6);

  await page.goto("/capture");
  await addNote(page, "Captured with no signal.");
  await page.goto("/inbox");
  await expect(page.getByText("Captured with no signal.")).toBeVisible();

  await page.goto("/scenario?id=SCN-S4");
  await expect(page.getByRole("heading", { name: "Captures (3)" })).toBeVisible();
  const gauge = page.locator('img[src="/demo-assets/s4/fe-115-gauge.svg"]');
  await expect(gauge).toBeVisible();
  expect(await gauge.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Platform" }).click();
  await expect(page.getByRole("heading", { name: "Platform" })).toBeVisible();

  await context.setOffline(false);
});

test("reset demo clears local captures", async ({ page }) => {
  await openToday(page);
  await menu(page, "Load demo day");
  await expect(page.locator('a[href^="/scenario?id="]')).toHaveCount(6);
  await menu(page, "Reset demo");
  await expect(page.getByText("No scenarios yet.")).toBeVisible();
  await expect(page.locator('a[href="/inbox"]').first()).toContainText("0");
});
