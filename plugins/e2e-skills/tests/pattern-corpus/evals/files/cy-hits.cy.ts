// Corpus fixture: one deliberate hit for every Cypress check scan.mjs runs.
// Every smell below is intentional. See ../../README.md.
/// <reference types="cypress" />

let cySharedState = 0;

Cypress.on('uncaught:exception', () => false);

describe('cypress corpus', () => {
  it.only('every cypress smell, once', () => {
    cy.visit('/');
    cy.wait(500);
    cy.get('.row').first().click();
    cy.get('#save').click({ force: true });
    cy.get('#password').type('password123');
    cy.get('#total').should('have.text', String(cySharedState), { timeout: 0 });
  });
});
