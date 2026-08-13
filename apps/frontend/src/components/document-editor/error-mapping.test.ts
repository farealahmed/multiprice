import { describe, expect, it } from 'vitest';

import { mapDocumentErrors } from './error-mapping';

describe('mapDocumentErrors', () => {
  it('maps a nested line path to its row and field', () => {
    const errors = mapDocumentErrors(
      [{ path: 'lines.2.quantity', code: 'QUANTITY_TOO_LOW', message: 'Quantity must be at least 0.001.' }],
      3,
    );

    expect(errors.rows.get(2)).toEqual({ quantity: 'Quantity must be at least 0.001.' });
    expect(errors.documentLevel).toEqual([]);
  });

  it('keeps unmapped paths visible at document level', () => {
    const errors = mapDocumentErrors(
      [{ path: 'lines.7.unknown', code: 'VALIDATION_FAILED', message: 'Unexpected field.' }],
      1,
    );

    expect(errors.documentLevel).toEqual(['Unexpected field.']);
  });
});
