/**
 * Display formatting for money values — the only place money is turned into
 * text in this frontend. Formatting is not arithmetic: values arrive from the
 * server already rounded to 2dp; this only decides how they look.
 */
const moneyFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}
