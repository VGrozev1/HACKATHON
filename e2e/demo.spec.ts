// The live demo, click by click (docs/DEMO.md). Run after every merge:
//   npm run demo:check
// One test on purpose: the steps share state (the agent run creates the order we approve),
// exactly as they do in front of the judges.

import { expect, test } from "@playwright/test";

test("demo path: fleet → machine → run night → approve → simulation → investor", async ({ page }) => {
  // 1. Fleet overview: KPIs and all machines.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fleet overview" })).toBeVisible();
  await expect(page.getByText("Machines online")).toBeVisible();
  const cards = page.locator('a[href^="/machines/"]');
  await expect(cards).toHaveCount(20);

  // Map view renders markers.
  await page.getByRole("radio", { name: "Map" }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator("path.leaflet-interactive")).toHaveCount(20);
  await page.getByRole("radio", { name: "Cards" }).click();

  // 2. Gym Lozenets detail: sales chart, stock table, forecast.
  await page.getByRole("link", { name: /Gym Lozenets/ }).first().click();
  await expect(page).toHaveURL(/\/machines\/SOF-GYM-01$/);
  await expect(page.getByRole("heading", { name: "Gym Lozenets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales, last 60 days" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stock per slot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Forecast vs actual" })).toBeVisible();
  await expect(page.getByText(/sold out/).first()).toBeVisible();

  // 3. Run night, reached with the keyboard shortcut used on stage.
  await page.keyboard.press("3");
  await expect(page).toHaveURL(/\/run-night$/);
  await page.getByRole("button", { name: /Run tonight's agent/ }).click();
  await expect(page.getByText("Agent working…")).toBeVisible();
  await expect(page.getByText("Run complete")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Agent summary")).toBeVisible();
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();
  for (const tab of ["Route", "Decisions"]) {
    await page.getByRole("tab", { name: new RegExp(tab) }).click();
  }
  await expect(page.getByText(/exceeds €300 limit/).first()).toBeVisible();

  // 4. Orders: approve the €412 order the agent just created.
  await page.keyboard.press("4");
  await expect(page).toHaveURL(/\/orders$/);
  const row = page.locator("tbody tr", { hasText: "€412.00" });
  await expect(row).toContainText("Waiting for approval");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/approved/i).filter({ hasText: "PO-" }).first()).toBeVisible();
  await expect(row).toContainText("Approved");

  // 5. Simulation: the one number.
  await page.keyboard.press("5");
  await expect(page).toHaveURL(/\/simulation$/);
  await page.getByRole("button", { name: /Fast-forward a week/ }).click();
  await expect(page.getByText(/Day \d\/7/)).toBeVisible();
  await expect(page.getByText("fewer stock-outs than a fixed weekly order")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("86%")).toBeVisible({ timeout: 5_000 });

  // 6. Investor view: statement and payout models.
  await page.keyboard.press("6");
  await expect(page).toHaveURL(/\/investor\/SOF-GYM-01$/);
  await expect(page.getByText("Payout to investor")).toBeVisible();
  const payout = page.locator("article").getByText(/^€[\d,]+\.\d{2}$/).last();
  const before = await payout.textContent();
  await page.getByRole("radio", { name: /C · Profit share/ }).click();
  await expect(payout).not.toHaveText(before ?? "");

  // Nothing on the path may scroll sideways at laptop width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("owner portal: health, profit and accepting an agent suggestion", async ({ page }) => {
  await page.goto("/owner/SOF-GYM-01");
  await expect(page.getByRole("heading", { name: "My machine" })).toBeVisible();
  await expect(page.getByText("Needs attention")).toBeVisible();
  await expect(page.getByText("Profit, last 4 weeks")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales and profit by week" })).toBeVisible();
  await expect(page.getByText("Suggestions from the agent")).toBeVisible();

  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(page.getByText("Suggestion accepted")).toBeVisible();
  await expect(page.getByText("Accepted: applies from tomorrow night")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).first().click();
  await expect(page.getByText(/Dismissed: /)).toBeVisible();

  // An offline machine leads with the repair suggestion.
  await page.getByLabel("Viewing as owner of").selectOption("SOF-OFF-02");
  await expect(page).toHaveURL(/\/owner\/SOF-OFF-02$/);
  await expect(page.getByText("Book a technician for the card reader")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
