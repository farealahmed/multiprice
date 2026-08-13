import { z } from 'zod';

/**
 * Report contract — schemas and error codes for `GET /api/v1/reports/summary`
 * and the amended `GET /api/v1/documents` range query.
 *
 * Validation failures that correspond to this domain's error codes are raised
 * through zod's `superRefine`/`ctx.addIssue({ code: 'custom', params: { code } })`
 * so the existing envelope mapper can surface a SCREAMING_SNAKE domain code.
 */

export const DATE_RANGE_INVALID = 'DATE_RANGE_INVALID' as const;
export const DATE_RANGE_INVERTED = 'DATE_RANGE_INVERTED' as const;

export type ReportErrorCode =
  | typeof DATE_RANGE_INVALID
  | typeof DATE_RANGE_INVERTED;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function dateField(path: 'from' | 'to') {
  return z.string().superRefine((value, ctx) => {
    if (!DATE_REGEX.test(value)) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        params: { code: DATE_RANGE_INVALID },
        message: `${path} must be YYYY-MM-DD`,
      });
    }
  });
}

/**
 * Optional inclusive date range shared by the report and document-list routes.
 *
 * Both ends are optional independently. When both are present, `from` must be
 * less than or equal to `to`. A single-day range (`from === to`) is valid.
 */
export const dateRangeQuerySchema = z
  .object({
    from: dateField('from').optional(),
    to: dateField('to').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.from !== undefined && value.to !== undefined && value.from > value.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        params: { code: DATE_RANGE_INVERTED },
        message: 'to must be on or after from',
      });
    }
  });

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

/**
 * Response shape for `GET /api/v1/reports/summary`.
 *
 * Money fields are in major units (e.g. dollars). `from` and `to` are echoed
 * back from the validated query.
 */
export const reportSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  documentCount: z.number().int().min(0),
  totalGrandTotal: z.number(),
  totalTax: z.number(),
  totalDiscount: z.number(),
});

export type ReportSummary = z.infer<typeof reportSummarySchema>;

/**
 * Every `ReportErrorCode` member, listed once more as a value array. The
 * `satisfies` clause makes this array's element type exactly
 * `ReportErrorCode` — if a member is ever added to or removed from the type
 * above without updating this array, the assignment below stops type-checking.
 */
export const REPORT_ERROR_CODES = [
  DATE_RANGE_INVALID,
  DATE_RANGE_INVERTED,
] as const satisfies readonly ReportErrorCode[];

type MissingFromList = Exclude<ReportErrorCode, (typeof REPORT_ERROR_CODES)[number]>;
// If this line fails to compile, a ReportErrorCode member exists that isn't
// listed in REPORT_ERROR_CODES above — add it there too.
const _allCodesListed: MissingFromList extends never ? true : never = true;
void _allCodesListed;
