describe('pricing preview — editor', () => {
  it('computes the PDF sample totals from the server, not the client', () => {
    // /editor now sits behind the (app) auth guard (Phase 2) — sign up a
    // fresh user first so the session cookie is set before visiting it.
    const email = `pricing-preview-${Date.now()}@example.com`;
    cy.request('POST', '/auth/signup', { email, password: 'pricing-preview-password12' });

    cy.intercept('POST', '/api/v1/pricing/preview').as('preview');
    cy.visit('/editor');

    // Row 1 — Widget A: qty 2, unit price 100.00, 10% discount, 5% tax.
    cy.get('[aria-label="Row 1 quantity"]').type('2');
    cy.get('[aria-label="Row 1 unit price"]').type('100');
    cy.get('[aria-label="Row 1 discount type"]').select('percent');
    cy.get('[aria-label="Row 1 discount value"]').type('10');
    cy.get('[aria-label="Row 1 tax percent"]').type('5');

    // Row 2 — Widget B: qty 1, unit price 50.00, no discount, 5% tax.
    cy.contains('button', '+ Add line').click();
    cy.get('[aria-label="Row 2 quantity"]').type('1');
    cy.get('[aria-label="Row 2 unit price"]').type('50');
    cy.get('[aria-label="Row 2 tax percent"]').type('5');

    // Row 3 — Service fee: qty 1, unit price 200.00, $20 fixed discount, no tax.
    cy.contains('button', '+ Add line').click();
    cy.get('[aria-label="Row 3 quantity"]').type('1');
    cy.get('[aria-label="Row 3 unit price"]').type('200');
    cy.get('[aria-label="Row 3 discount type"]').select('fixed');
    cy.get('[aria-label="Row 3 discount value"]').type('20');

    // The grand total reads the fixture's worked answer.
    cy.contains('span', 'Grand total').closest('div').find('span').last().should('contain', '421.50');

    // Prove the number on screen came from the API response, not client math.
    cy.get('@preview.all').should((calls) => {
      expect(calls.length).to.be.at.least(1);
      expect(calls[calls.length - 1].response.body.grandTotal).to.eq(421.5);
    });
  });
});
