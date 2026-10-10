// The live demo, click by click (docs/DEMO.md). Run after every merge:
//   npm run demo:check
// Works against the real API or, if it's down, the built-in backup data: the demo
// must look the same either way.

import { expect, test, type Page } from "@playwright/test";

/** Nothing on the path may scroll sideways at laptop width. */
async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// One test on purpose: the steps share state (the agent's run creates the €412 order
// we approve), exactly as they do in front of the judges.
test("judges' demo: dashboard → run night → approve → accept a suggestion → fast-forward → benchmark", async ({ page }) => {
  // 1. Dashboard.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fleet overview" })).toBeVisible();
  await expect(page.locator('a[href^="/machines/"]')).toHaveCount(20);
  await expectNoSideScroll(page);

  // 2. Run night (the keyboard shortcut used on stage).
  await page.keyboard.press("3");
  await expect(page).toHaveURL(/\/run-night$/);
  await page.getByRole("button", { name: /Run tonight's agent/ }).click();
  await expect(page.getByText("Agent working…")).toBeVisible();
  await expect(page.getByText("Run complete")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Agent summary")).toBeVisible();
  await expect(page.getByText(/exceeds (the )?€300 limit/).first()).toBeVisible();
  await expect(page.getByText("Why it was rejected").first()).toBeVisible();
  await expectNoSideScroll(page);

  // 3. Approve the €412 order, through the confirmation step.
  await page.keyboard.press("4");
  await expect(page).toHaveURL(/\/orders$/);
  const row = page.locator("tbody tr", { hasText: "€412.00" });
  await expect(row).toContainText("Waiting for approval");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Approve €412.00 to Balkan Snack Distribution?");
  await page.getByRole("button", { name: "Approve and send" }).click();
  await expect(row).toContainText("Approved");

  // 4. Accept a suggestion: only its status changes.
  const card = page.locator('[data-slot="card"]', { hasText: "Suggestions from the agent" });
  const heatwave = card.locator("li", { hasText: "35°C this weekend" });
  await heatwave.getByRole("button", { name: "Accept" }).click();
  await expect(heatwave).toContainText("Accepted");
  await expect(card.locator('[data-slot="card-title"]')).toContainText("3 pending");
  await expectNoSideScroll(page);

  // 5. Fast-forward a week and 6. see the benchmark.
  await page.keyboard.press("5");
  await expect(page).toHaveURL(/\/simulation$/);
  await page.getByRole("button", { name: /Fast-forward a week/ }).click();
  await expect(page.getByText(/Day \d\/7/)).toBeVisible();
  await expect(page.getByText(/(fewer|more|the same) stock-outs (than|as) a fixed weekly order/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Agent vs fixed weekly order" })).toBeVisible();
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expectNoSideScroll(page);
});

test("tour: map, machine detail and the investor statement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Map" }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator("path.leaflet-interactive")).toHaveCount(20);
  await page.getByRole("radio", { name: "Cards" }).click();

  await page.getByRole("link", { name: /Gym Lozenets/ }).first().click();
  await expect(page).toHaveURL(/\/machines\/SOF-GYM-01$/);
  await expect(page.getByRole("heading", { name: "Sales, last 60 days" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stock per slot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Forecast vs actual" })).toBeVisible();

  await page.keyboard.press("6");
  await expect(page).toHaveURL(/\/investor\/SOF-GYM-01$/);
  await expect(page.getByText("Payout to investor")).toBeVisible();
  const payout = page.locator("article").getByText(/^€[\d,]+\.\d{2}$/).last();
  const before = await payout.textContent();
  await page.getByRole("radio", { name: /C · Profit share/ }).click();
  await expect(payout).not.toHaveText(before ?? "");
  await expectNoSideScroll(page);
});

test("owner portal: health, profit and accepting an agent suggestion", async ({ page }) => {
  await page.goto("/owner/SOF-GYM-01");
  await expect(page.getByRole("heading", { name: "My machine" })).toBeVisible();
  await expect(page.getByText("Needs attention")).toBeVisible();
  await expect(page.getByText("Profit, last 4 weeks")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales and profit by week" })).toBeVisible();

  // The machine as it looks on site: type B3 on the keypad and read the display.
  const machine = page.locator("section", { hasText: "Inside your machine" });
  await expect(machine.getByRole("button", { name: /^A1 Devin water/ })).toContainText("0/24");
  await machine.getByRole("button", { name: "B", exact: true }).click();
  await machine.getByRole("button", { name: "3", exact: true }).click();
  await expect(machine.getByRole("status")).toContainText("B3 · Peach ice tea 0.5 l");
  await expect(machine.getByRole("status")).toContainText("left");

  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(page.getByText("Suggestion accepted")).toBeVisible();
  await expect(page.getByText("Accepted: applies from tomorrow night")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).first().click();
  await expect(page.getByText(/Dismissed: /)).toBeVisible();

  await page.getByLabel("Viewing as owner of").selectOption("SOF-OFF-02");
  await expect(page).toHaveURL(/\/owner\/SOF-OFF-02$/);
  await expect(page.getByText("Book a technician for the card reader")).toBeVisible();
  await expectNoSideScroll(page);
});
