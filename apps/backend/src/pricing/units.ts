/** Converts finite decimal boundary values to exact scaled integers. */
function toScaled(value: number, scale: number, unit: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${unit} must be finite`);
  }

  const scaled = value * scale;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8) {
    throw new RangeError(`${unit} has unsupported precision`);
  }

  return rounded;
}

export function toCents(value: number): number {
  return toScaled(value, 100, 'Money');
}

export function fromCents(value: number): number {
  return value / 100;
}

export function toThousandths(value: number): number {
  return toScaled(value, 1_000, 'Quantity');
}

export function fromThousandths(value: number): number {
  return value / 1_000;
}

export function toBasisPoints(value: number): number {
  return toScaled(value, 100, 'Percentage');
}

export function fromBasisPoints(value: number): number {
  return value / 100;
}
