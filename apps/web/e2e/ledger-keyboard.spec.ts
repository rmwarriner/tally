import { expect, test } from "@playwright/test";

test("slash focuses ledger search input", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-tab-ledger").click();

  await page.keyboard.press("/");

  const searchInput = page.getByTestId("ledger-search-input");
  await expect(searchInput).toBeFocused();
});

test("command palette can focus register search and closes with escape", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-tab-ledger").click();

  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByRole("button", { name: "Focus register search" }).click();
  await expect(page.getByTestId("ledger-search-input")).toBeFocused();

  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
