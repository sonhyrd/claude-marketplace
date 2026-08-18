// Corpus fixture: the suppressed twin of cy-hits.cy.ts. Every line below carries a
// `// JUSTIFIED:` marker above it and must produce NO hit — except `it.only(`, which is
// never exemptible (the #7 no-exemption contract).
/// <reference types="cypress" />

// JUSTIFIED: corpus twin — module state is the thing under test here
let cySharedState = 0;

// JUSTIFIED: corpus twin — the third-party analytics script throws on load and cannot be stubbed
Cypress.on('uncaught:exception', () => false);

describe('cypress corpus twin', () => {
  // JUSTIFIED: this marker must NOT suppress a focused test — #7 has no exemption
  it.only('every cypress smell, suppressed', () => {
    cy.visit('/');
    // JUSTIFIED: corpus twin — the widget animates on a fixed timer with no settle event
    cy.wait(500);
    // JUSTIFIED: corpus twin — the list is deliberately order-dependent
    cy.get('.row').first().click();
    // JUSTIFIED: corpus twin — the overlay is decorative and never becomes hit-testable
    cy.get('#save').click({ force: true });
    // JUSTIFIED: corpus twin — this is a throwaway seeded account, not a real credential
    cy.get('#password').type('password123');
    // JUSTIFIED: corpus twin — the value is already settled by the preceding assertion
    cy.get('#total').should('have.text', String(cySharedState), { timeout: 0 });
  });
});
