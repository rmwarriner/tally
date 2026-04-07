import { expect, test } from "@playwright/test";

test("create, edit, and delete transaction from register", async ({ page }) => {
  const description = `Smoke txn ${Date.now()}`;
  const editedDescription = `${description} edited`;

  await page.goto("/");
  await page.getByTestId("view-tab-ledger").click();

  const draftRow = page.locator("table tbody tr").first();
  await draftRow.getByPlaceholder("New transaction").fill(description);
  await draftRow.getByPlaceholder("Unassigned").fill("Smoke Payee");
  await draftRow.locator("input").nth(3).fill("23.45");
  const postButton = draftRow.getByTestId("ledger-post-transaction");
  await expect(postButton).toBeEnabled();
  await postButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  const postedRow = page.locator("tbody tr", { hasText: description }).first();
  await expect(postedRow).toBeVisible();
  const transactionId = await postedRow.getAttribute("data-transaction-id");
  if (!transactionId) {
    throw new Error("Expected posted row to expose data-transaction-id");
  }

  await postedRow.getByRole("button", { name: "Advanced" }).click({ force: true });
  const transactionEditorForm = page.locator(".ledger-detail-form");
  await expect(transactionEditorForm).toBeVisible();
  const descriptionInput = transactionEditorForm.getByLabel("Description");
  await descriptionInput.fill(editedDescription);
  await transactionEditorForm.getByRole("button", { name: "Save transaction" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  const editedRow = page.locator("tbody tr", { hasText: editedDescription }).first();
  await expect(editedRow).toBeVisible();
  await expect(page.getByText("Transaction update completed.")).toBeVisible();

  await page.getByTestId(`ledger-delete-${transactionId}`).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.getByText("Transaction delete completed.")).toBeVisible();
  await expect(page.locator("tbody tr", { hasText: editedDescription })).toHaveCount(0);
});

test("records reconciliation from ledger operations", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-tab-ledger").click();
  await page.getByRole("button", { name: "Open reconciliation workspace" }).click();
  await expect(page.getByText("Reconcile", { exact: true })).toBeVisible();

  const firstCandidate = page.locator(".reconciliation-candidate").first();
  if (await firstCandidate.count()) {
    await firstCandidate.click();
  }

  await page.getByRole("button", { name: "Record reconciliation" }).click();
  await expect(page.getByText("Reconciliation completed.")).toBeVisible();
});
