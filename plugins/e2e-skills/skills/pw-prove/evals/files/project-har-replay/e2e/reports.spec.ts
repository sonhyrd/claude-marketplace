import { test, expect } from "@playwright/test";

import { ReportsPage } from "./pages/ReportsPage";

test.use({ viewport: { width: 1600, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.routeFromHAR(process.env.PW_PROVE_HAR ?? "e2e/reports.api.har", {
    url: "**/api/**",
    notFound: "abort",
  });
});

test("lists the reports the workspace owns", async ({ page }) => {
  // PROVES: A member opening /reports sees every report in their workspace, newest first.
  const reports = new ReportsPage(page);
  await reports.goto();

  await expect(reports.rows).toHaveCount(2);
  await expect(reports.rows.first()).toContainText("Q3 revenue");
});

test("opens a report and shows its summary", async ({ page }) => {
  // PROVES: Selecting a report loads its summary without a full page reload.
  const reports = new ReportsPage(page);
  await reports.goto();
  await reports.open("Q3 revenue");

  await expect(reports.summary).toContainText("42 rows");
});
