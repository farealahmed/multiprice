import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_FINALIZED,
  DOCUMENT_HAS_NO_LINES,
  LIFECYCLE_ERROR_CODES,
} from './lifecycle.ts';

describe('lifecycle contracts — error codes', () => {
  it('DOCUMENT_FINALIZED equals its own SCREAMING_SNAKE name', () => {
    expect(DOCUMENT_FINALIZED).toBe('DOCUMENT_FINALIZED');
  });

  it('DOCUMENT_HAS_NO_LINES equals its own SCREAMING_SNAKE name', () => {
    expect(DOCUMENT_HAS_NO_LINES).toBe('DOCUMENT_HAS_NO_LINES');
  });

  it('lists every LifecycleErrorCode in the code array', () => {
    const expected = [DOCUMENT_FINALIZED, DOCUMENT_HAS_NO_LINES];
    expect(LIFECYCLE_ERROR_CODES.length).toBe(expected.length);
    for (const code of expected) {
      expect(LIFECYCLE_ERROR_CODES).toContain(code);
    }
  });
});
