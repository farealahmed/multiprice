import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { mapToEnvelope } from './envelope-mapper.ts';

describe('mapToEnvelope — domain code passthrough', () => {
  it('passes through a domain code via params.code', () => {
    const schema = z.object({ quantity: z.number() }).superRefine((_v, ctx) => {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        params: { code: 'QUANTITY_TOO_LOW' },
        message: 'Quantity must be at least 1',
      });
    });
    const result = schema.safeParse({ quantity: 0 });
    if (result.success) throw new Error('expected failure');

    const envelope = mapToEnvelope(result.error);
    expect(envelope.error.details).toHaveLength(1);
    expect(envelope.error.details?.[0]).toMatchObject({ path: 'quantity', code: 'QUANTITY_TOO_LOW' });
  });

  it('falls back to zod native code when no params.code is set (regression guard)', () => {
    // Same construction as health.test.ts's existing ZodError coverage.
    const schema = z.object({
      qty: z.number().positive(),
      sku: z.string(),
    });
    const result = schema.safeParse({ qty: 0, sku: undefined });
    if (result.success) throw new Error('expected failure');

    const envelope = mapToEnvelope(result.error);
    expect(envelope.error.details).toHaveLength(2);
    expect(envelope.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'qty', code: 'too_small' }),
        expect.objectContaining({ path: 'sku', code: 'invalid_type' }),
      ]),
    );
  });
});
