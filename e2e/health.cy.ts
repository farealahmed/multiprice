describe('health page', () => {
  it('shows a healthy backend and database', () => {
    cy.visit('/');
    cy.get('[data-testid="health-backend-status"]').should('contain', 'ok');
    cy.get('[data-testid="health-db-status"]').should('contain', 'up');
  });

  it('renders the app version', () => {
    cy.visit('/');
    cy.get('[data-testid="health-version"]').should('not.be.empty');
  });
});
