// The live demo, click by click (docs/DEMO.md). Run after every merge:
//   npm run demo:check
// Works against the real API or, if it's down, the built-in backup data: the demo
// must look the same either way.

import { readFileSync } from "node:fs";
import path from "node:path";
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
  await signIn(page, "operator", "/");
  await expect(page).toHaveURL((u) => u.pathname === "/");
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
  await signIn(page, "operator", "/");
  await expect(page).toHaveURL((u) => u.pathname === "/");
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

/** Demo investor logins, read from the one place they're written down. */
function demoAccount(username: string): { username: string; password: string } {
  const doc = readFileSync(path.join(process.cwd(), "docs", "DEMO-ACCOUNTS.md"), "utf8");
  const row = doc.split(/\r?\n/).find((l) => l.includes("`" + username + "`"));
  const password = row?.split("|")[3]?.trim().replace(/`/g, "");
  if (!password) throw new Error(`No demo account ${username} in docs/DEMO-ACCOUNTS.md`);
  return { username, password };
}

async function signIn(page: Page, username: string, next = "/owner") {
  const { password } = demoAccount(username);
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("investor login: own machines only, sign out", async ({ page }) => {
  // Not signed in: the portal sends you to the login page and back afterwards.
  await page.goto("/owner");
  await expect(page).toHaveURL((u) => u.pathname === "/login" && u.searchParams.get("next") === "/owner");

  await page.getByLabel("Username").fill("serdika");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("don't match");

  await signIn(page, "serdika");
  await expect(page).toHaveURL((u) => u.pathname === "/owner");
  await expect(page.getByRole("heading", { name: "Serdika Holdings" })).toBeVisible();
  await expect(page.getByText("Signed in as")).toContainText("Serdika Holdings");
  const cards = page.locator('main a[href^="/owner/SOF-"]');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('main a[href="/owner/SOF-GYM-01"]')).toHaveCount(0);

  // Someone else's machine: back to your own list.
  await page.goto("/owner/SOF-GYM-01");
  await expect(page).toHaveURL((u) => u.pathname === "/owner");

  // Your own machine: only your machines in the picker, and the machine view.
  await page.locator('main a[href="/owner/SOF-HOS-02"]').click();
  await expect(page).toHaveURL((u) => u.pathname === "/owner/SOF-HOS-02");
  await expect(page.getByRole("combobox", { name: "Machine" }).locator("option")).toHaveCount(4);
  await expect(page.locator("section", { hasText: "Inside your machine" }).getByRole("status")).toBeVisible();
  await expectNoSideScroll(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/login" && !u.search);
  await page.goto("/owner/SOF-HOS-02");
  await expect(page).toHaveURL((u) => u.pathname === "/login" && u.searchParams.has("next"));
});

test("owner portal: health, profit, the machine view and an agent suggestion", async ({ page }) => {
  await signIn(page, "lozenets", "/owner/SOF-GYM-01");
  await expect(page).toHaveURL((u) => u.pathname === "/owner/SOF-GYM-01");
  await expect(page.getByRole("heading", { name: "My machine" })).toBeVisible();
  await expect(page.getByText("Needs attention")).toBeVisible();
  await expect(page.getByText("Profit, last 4 weeks")).toBeVisible();
  await expect(page.getByText("model B (20% of sales)")).toBeVisible();
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

  // The full statement stays in the portal, on the investor's own terms (B, 20%).
  await page.getByRole("link", { name: /Full statement/ }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/owner/SOF-GYM-01/statement");
  await expect(page.getByText("Payout to investor")).toBeVisible();
  await expect(page.getByText("Your contract terms")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Payout to investor" })).toContainText("20% of sales");
  await page.getByRole("link", { name: /Back to the machine/ }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/owner/SOF-GYM-01");

  // Lozenets Capital owns 2 machines; switch to the other one.
  await expect(page.getByRole("combobox", { name: "Machine" }).locator("option")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Machine" }).selectOption("SOF-OFF-08");
  await expect(page).toHaveURL((u) => u.pathname === "/owner/SOF-OFF-08");
  await expectNoSideScroll(page);
});

test("owner portal: an offline machine leads with the repair", async ({ page }) => {
  await signIn(page, "iskar", "/owner/SOF-OFF-02");
  await expect(page).toHaveURL((u) => u.pathname === "/owner/SOF-OFF-02");
  await expect(page.getByText("Book a technician for the card reader")).toBeVisible();
});

test("the operator dashboard needs an operator", async ({ page }) => {
  // Signed out: the dashboard sends you to the login page.
  await page.goto("/orders");
  await expect(page).toHaveURL((u) => u.pathname === "/login");

  // An investor is sent back to their portal, never into the operator screens.
  await signIn(page, "vitosha", "/owner");
  await expect(page).toHaveURL((u) => u.pathname === "/owner");
  await page.goto("/orders");
  await expect(page).toHaveURL((u) => u.pathname === "/owner");
  await page.goto("/run-night");
  await expect(page).toHaveURL((u) => u.pathname === "/owner");
});
