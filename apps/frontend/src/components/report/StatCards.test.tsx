/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { formatMoney } from '@/components/money/format-money';
import type { ReportSummary } from '@/lib/api/types/report';

import { StatCards } from './StatCards';

const summary: ReportSummary = {
  from: '2026-07-01',
  to: '2026-07-31',
  documentCount: 2,
  totalGrandTotal: 7426.78,
  totalTax: 274.58,
  totalDiscount: 401.8,
};

describe('StatCards', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the four server figures verbatim', () => {
    render(<StatCards summary={summary} />);

    expect(screen.getByText(String(summary.documentCount))).toBeTruthy();
    expect(screen.getByText(formatMoney(summary.totalGrandTotal))).toBeTruthy();
    expect(screen.getByText(formatMoney(summary.totalTax))).toBeTruthy();
    expect(screen.getByText(formatMoney(summary.totalDiscount))).toBeTruthy();
  });

  it('echoes the date range on the documents card', () => {
    render(<StatCards summary={summary} />);

    expect(screen.getByText('2026-07-01 → 2026-07-31')).toBeTruthy();
  });
});
