import type { Locator, Page } from "@playwright/test";

export class ReportsPage {
  readonly rows: Locator;
  readonly summary: Locator;

  constructor(private readonly page: Page) {
    this.rows = page.getByRole("row").filter({ hasNot: page.getByRole("columnheader") });
    this.summary = page.getByTestId("report-summary");
  }

  async goto() {
    await this.page.goto("/reports");
  }

  async open(name: string) {
    await this.page.getByRole("link", { name }).click();
  }
}
