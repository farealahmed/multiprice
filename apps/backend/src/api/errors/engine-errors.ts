import type { ErrorEnvelope } from '../../contracts/errors/envelope.ts';
import { PricingPreviewError } from '../../services/pricing-preview.ts';

/** Maps a pricing-engine failure to the frozen API error envelope. */
export function mapPricingEngineError(error: unknown): ErrorEnvelope | null {
  if (!(error instanceof PricingPreviewError)) {
    return null;
  }

  const { code, message } = error.cause;
  const path = error.lineIndex == null ? '(root)' : `lines.${error.lineIndex}.discount.value`;

  return {
    error: {
      code,
      message,
      details: [{ path, code, message }],
    },
  };
}
