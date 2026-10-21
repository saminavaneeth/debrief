import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  page.on("dialog", (d) => void d.accept());
  await request.post("/api/demo/reset");
});

test("process the demo day, review with evidence, answer a gap, push, see linked records", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Load demo day" }).click();
  await expect(page.locator('a[href^="/scenario?id="]')).toHaveCount(6);

  await page.getByRole("link", { name: /Process 6 scenarios/ }).click();
  await expect(page.getByRole("heading", { name: "Process" })).toBeVisible();
  await page.getByLabel("Show each step as it runs").uncheck();
  await page.getByRole("button", { name: "Process 6 scenarios" }).click();

  await expect(page).toHaveURL(/\/review\?cs=CS-/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Proposed changes" })).toBeVisible();

  // Inbox sort suggestion for the V-22 note.
  await expect(page.getByText(/mentions V-22, which “Tank farm leak” is about/)).toBeVisible();

  // S1: the near-miss incident, the HAZ-0007 update and the operator question.
  const s1 = page.getByRole("region", { name: "Forklift near-miss, Dock 3" });
  await expect(s1.getByText(/^Near miss: FL-07 was reversing/)).toBeVisible();
  await expect(s1.getByText("HAZ-0007", { exact: true })).toBeVisible();
  await expect(s1.getByText("mitigating")).toBeVisible();

  // Evidence drawer: the incident type comes from the highlighted transcript sentence.
  await s1.getByRole("button", { name: "Show details" }).first().click();
  await s1.getByRole("button", { name: /^Type/ }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Type" })).toBeVisible();
  await expect(drawer.locator("mark").first()).toContainText("nearly clipped Luis Ortega");
  await page.keyboard.press("Escape");

  // S2: not recordable, citing the 1904.7 first-aid list.
  const s2 = page.getByRole("region", { name: "Slip in break room" });
  await s2.getByRole("button", { name: "Show details" }).first().click();
  await s2.getByRole("button", { name: /^OSHA recordable/ }).click();
  await expect(
    drawer.getByText("Recordkeeping: general recording criteria and first aid"),
  ).toBeVisible();
  await expect(drawer.getByText(/Hot or cold therapy/)).toBeVisible();
  await page.keyboard.press("Escape");

  await s1.getByLabel("Who was operating FL-07?").selectOption("P-005");
  await expect(s1.getByText("Answered: Tom Becker")).toBeVisible();

  await page.getByRole("button", { name: "Approve all" }).click();
  await expect(page.getByText(/All approved/)).toBeVisible();
  await page.getByRole("button", { name: /^Push \d+$/ }).click();

  await expect(page).toHaveURL(/\/results\?cs=/, { timeout: 30_000 });
  const done = page.getByText(/^(\d+) of \1 actions done/);
  await expect(done).toBeVisible();
  await expect(page.getByRole("img", { name: /Link graph of \d+ records/ })).toBeVisible();
  // The record list under the graph (the graph node carries the same name).
  const incLink = page
    .getByRole("listitem")
    .getByRole("link", { name: /^INC-\d{4} Near miss: FL-07/ });
  await expect(incLink).toBeVisible();

  // The EHS console shows the new incident, linked to HAZ-0007, with the operator answered.
  await incLink.click();
  await expect(page).toHaveURL(/\/console\?server=incidents&id=INC-0009/);
  await expect(page.getByRole("heading", { name: /Near miss: FL-07/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Related to\s*HAZ-0007/ })).toBeVisible();
  await expect(page.getByText("Tom Becker").first()).toBeVisible();

  await page.goto("/console?server=inspections&id=INS-0021");
  await expect(
    page
      .getByRole("button", { name: /FE-115.*Resulted in\s*HAZ-0014|Resulted in\s*HAZ-001\d/ })
      .first(),
  ).toBeVisible();

  // Scenarios are marked pushed on the device.
  await page.goto("/");
  await expect(page.getByText("Pushed").first()).toBeVisible();
});

test("own capture: a PDF checklist read on the device completes the scheduled inspection", async ({
  page,
}) => {
  const fs = await import("node:fs");
  const pdf = fs.readFileSync("public/demo-assets/s4/extinguisher-checklist.pdf");
  await page.goto("/capture");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page
    .locator('input[type="file"][accept="application/pdf,image/*"]')
    .setInputFiles({ name: "checklist.pdf", mimeType: "application/pdf", buffer: pdf });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Document details" })).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();

  await page.goto("/process");
  await page.getByLabel("Show each step as it runs").uncheck();
  await page.getByRole("button", { name: "Process 1 scenario" }).click();
  await expect(page).toHaveURL(/\/review\?cs=/, { timeout: 60_000 });

  // pdf.js text → table rows → the scheduled inspection is completed, failures become hazards.
  await expect(page.getByText("INS-0021", { exact: true })).toBeVisible();
  await expect(page.getByText(/status → completed/)).toBeVisible();
  await expect(page.getByText(/^FE-115:/)).toBeVisible();
  await expect(page.getByText(/^FE-119:/)).toBeVisible();
});

test("own capture: OCR reads an asset tag from a photo, so a known hazard is updated", async ({
  page,
}) => {
  await page.goto("/capture");
  // A photo of a white asset plate reading "FL-07".
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 400;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 900, 400);
    g.fillStyle = "#000";
    g.font = "bold 180px Arial";
    g.fillText("FL-07", 120, 260);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles({ name: "plate.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page
    .getByPlaceholder("What did you see?")
    .fill("Right-side mirror is cracked and still not replaced.");
  await page.getByRole("button", { name: "Save note" }).click();

  await page.goto("/process");
  await page.getByLabel("Show each step as it runs").uncheck();
  await page.getByRole("button", { name: "Process 1 scenario" }).click();
  await expect(page).toHaveURL(/\/review\?cs=/, { timeout: 90_000 });
  await expect(page.getByText("HAZ-0007", { exact: true })).toBeVisible();
});
