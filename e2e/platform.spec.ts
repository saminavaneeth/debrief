import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  page.on("dialog", (d) => void d.accept());
  await request.post("/api/demo/reset");
});

test("plug in training, process, workflows fire, patterns become a rule, evals run", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Plug in the Training system: no code change.
  await page.goto("/platform?tab=systems");
  const training = page.getByRole("switch", { name: "Connect Training" });
  await expect(training).toHaveAttribute("aria-checked", "false");
  await training.click();
  await expect(training).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText(/Training connected/)).toBeVisible();

  // Process the forklift near miss.
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Load demo day" }).click();
  await expect(page.locator('a[href^="/scenario?id="]')).toHaveCount(6);
  await page.goto("/process?scenarios=SCN-S1&run=1");
  await expect(page).toHaveURL(/\/review\?cs=/, { timeout: 60_000 });
  const s1 = page.getByRole("region", { name: "Forklift near-miss, Dock 3" });
  await expect(s1.getByText("Forklift operator refresher", { exact: true })).toBeVisible();
  await expect(s1.getByText("Who should take this training?")).toBeVisible();
  // Assignees are required by the Training system, so Push waits for the answer.
  await page.getByRole("button", { name: "Approve all" }).click();
  const pushButton = page.getByRole("button", { name: /^Push \d+$/ });
  await expect(pushButton).toBeDisabled();
  await expect(page.getByText("Answer before pushing, or reject the action:")).toBeVisible();
  await page.getByRole("button", { name: "Who should take this training?" }).click();
  await expect(s1.getByLabel("Who should take this training?")).toBeFocused();
  await s1.getByLabel("Who should take this training?").selectOption("P-005");
  await expect(pushButton).toBeEnabled();
  await pushButton.click();
  await expect(page).toHaveURL(/\/results\?cs=/, { timeout: 30_000 });
  await expect(page.getByText("Repeat hazards in one area suggest an audit")).toBeVisible();
  // Every action went through: the training assignment exists and nothing failed validation.
  await expect(page.getByText(/^(\d+) of \1 actions done/)).toBeVisible();
  await expect(page.getByRole("listitem").getByRole("link", { name: /^TRN-\d{4} / })).toBeVisible();
  await expect(page.getByText(/Validation failed/)).toHaveCount(0);

  // The suggestion card is in the activity feed.
  await page.goto("/platform?tab=activity");
  await expect(page.getByText("Schedule an audit of Dock 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(page.getByText("Suggestion accepted")).toBeVisible();

  // The agent proposes a rule from the FL-07 pattern; enabling it makes it live.
  await page.goto("/platform?tab=workflows");
  await page.getByRole("button", { name: "Find patterns" }).click();
  await expect(page.getByText("Flag new incidents involving FL-07")).toBeVisible();
  await page.getByRole("button", { name: "Enable rule" }).first().click();
  await expect(
    page.getByRole("switch", { name: "Enable Incident on FL-07 → maintenance review" }),
  ).toHaveAttribute("aria-checked", "true");

  // Audit log shows agent and workflow calls.
  await page.goto("/platform?tab=audit");
  await expect(page.getByText("training.create_record").first()).toBeVisible();
  await expect(page.getByText(/via workflow/).first()).toBeVisible();

  // Evals run from the screen.
  await page.goto("/platform?tab=evals");
  await page.getByRole("button", { name: "Run evals" }).click();
  await expect(page.getByText(/18\/18 cases fully correct/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Field accuracy")).toBeVisible();
});
