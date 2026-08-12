/**
 * Rounds halves away from zero. Pricing applies this to cents at every
 * fractional calculation point rather than relying on binary float formatting.
 */
export function roundHalfUp(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const whole = Math.floor(magnitude);

  return sign * (magnitude - whole >= 0.5 ? whole + 1 : whole);
}

/** Rounds an integer ratio without constructing an imprecise decimal. */
export function roundRatioHalfUp(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  const magnitude = Math.abs(numerator);
  const whole = Math.floor(magnitude / denominator);
  const remainder = magnitude % denominator;

  return sign * (remainder * 2 >= denominator ? whole + 1 : whole);
}
