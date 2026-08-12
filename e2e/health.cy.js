describe('health page', () => {
  it('shows a healthy backend and database', () => {
    cy.visit('/');
    // The UI maps the API's `status: 'ok'` to the user-friendly word
    // `healthy`. Assert on what the page renders, not the raw API value.
    cy.get('[data-testid="health-backend-status"]').should('contain', 'healthy');
    cy.get('[data-testid="health-db-status"]').should('contain', 'up');
  });

  it('renders the app version', () => {
    cy.visit('/');
    cy.get('[data-testid="health-version"]').should('not.be.empty');
  });
});
