type DocumentResponse = {
  id: string;
};

const line = {
  description: 'Lifecycle test service',
  quantity: 1,
  unitPrice: 100,
  discount: { type: 'none' },
  taxPercent: 0,
};

function createDraft(title: string) {
  return cy.request<DocumentResponse>('POST', '/api/v1/documents', {
    title,
    customer: 'Lifecycle test customer',
    issueDate: '2026-08-13',
    lines: [line],
  });
}

describe('document lifecycle', () => {
  beforeEach(() => {
    const email = `lifecycle-e2e-${Date.now()}-${Cypress._.random(1_000_000)}@example.com`;
    cy.request('POST', '/auth/signup', { email, password: 'lifecycle-e2e-password12' });
  });

  it('finalizes a draft through the UI and replaces the editor with the read-only record', () => {
    createDraft('Finalize through UI').then(({ body }) => {
      cy.intercept('POST', `/api/v1/documents/${body.id}/finalize`).as('finalize');
      cy.visit(`/documents/${body.id}`);

      cy.contains('button', 'Finalize document').click();
      cy.get('[role="dialog"]').should('contain', 'irreversible');
      cy.get('[role="dialog"]').contains('button', 'Finalize').click();
      cy.wait('@finalize').its('response.statusCode').should('eq', 200);

      cy.contains('main', 'read-only. Totals were computed server-side and are now locked.').should('be.visible');
      cy.contains('main', '409 DOCUMENT_FINALIZED').should('be.visible');
      cy.contains('button', 'Save draft').should('not.exist');
    });
  });

  it('surfaces a stale-save 409 after an out-of-band finalize without a second browser tab', () => {
    createDraft('Stale editor save').then(({ body }) => {
      cy.visit(`/documents/${body.id}`);
      cy.get('#document-title').clear().type('Unsaved title change');

      cy.request('POST', `/api/v1/documents/${body.id}/finalize`).its('status').should('eq', 200);
      cy.intercept('PATCH', `/api/v1/documents/${body.id}`).as('staleSave');
      cy.contains('button', 'Save draft').click();
      cy.wait('@staleSave').its('response.statusCode').should('eq', 409);

      cy.get('[role="alert"]').should(
        'contain',
        'This document has been finalized in another session. Your unsaved changes were not saved.',
      );
      cy.contains('main', 'read-only. Totals were computed server-side and are now locked.', {
        timeout: 5_000,
      }).should('be.visible');
    });
  });
});
