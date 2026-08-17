// Corpus fixture: the legacy Cypress layout. This file has no `.cy.` / `.spec.` / `.test.`
// suffix, so the suffix globs cannot see it — it is reachable ONLY through the
// `**/cypress/integration/**/*.{js,ts}` half of a `;`-separated multi-glob. `it.only(` (#7)
// and `cy.wait(<digit>)` (#9b) both live behind such a glob, so a hit on either proves the
// multi-glob split survived. Every smell below is intentional.
/// <reference types="cypress" />

describe('legacy layout', () => {
  it.only('committed focused test in the classic layout', () => {
    cy.visit('/');
    cy.wait(750);
  });

  // The JUSTIFIED twin, in the same file: suppression must work behind the CYI glob too, and #7 must
  // still refuse the exemption. So this block contributes exactly one hit — the `it.only(` — and the
  // cy.wait() below it contributes none.
  // JUSTIFIED: this marker must NOT suppress a focused test — #7 has no exemption
  it.only('suppressed twin in the classic layout', () => {
    cy.visit('/');
    // JUSTIFIED: corpus twin — the legacy widget animates on a fixed timer with no settle event
    cy.wait(750);
  });
});
