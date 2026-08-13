import type { Db } from 'mongodb';

import type { StoredDocument } from '../domain/document.ts';
import { buildIssueDateFilter } from './documents.repository.ts';

/**
 * Internal cents-scale aggregate. Never exported past this file — conversion to
 * major units happens once at the service boundary.
 */
export interface ReportAggregate {
  documentCount: number;
  totalGrandTotal: number;
  totalTax: number;
  totalDiscount: number;
}

export interface ReportViewAggregate {
  summary: ReportAggregate[];
  documents: StoredDocument[];
}

export interface ReportsRepository {
  summarize(ownerId: string, range?: { from?: string; to?: string }): Promise<ReportAggregate>;
  view(ownerId: string, range?: { from?: string; to?: string }): Promise<ReportViewAggregate>;
}

export function createReportsRepository(db: Db): ReportsRepository {
  const collection = db.collection<StoredDocument>('documents');

  return {
    summarize: async (ownerId, range) => {
      const result = await collection
        .aggregate<ReportAggregate>([
          {
            $match: {
              ownerId,
              ...buildIssueDateFilter(range),
            },
          },
          {
            $group: {
              _id: null,
              documentCount: { $sum: 1 },
              totalGrandTotal: { $sum: '$totals.grandTotal' },
              totalTax: { $sum: '$totals.totalTax' },
              totalDiscount: { $sum: '$totals.totalDiscount' },
            },
          },
        ])
        .toArray();

      if (result.length === 0) {
        return {
          documentCount: 0,
          totalGrandTotal: 0,
          totalTax: 0,
          totalDiscount: 0,
        };
      }

      return result[0]!;
    },

    view: async (ownerId, range) => {
      const result = await collection
        .aggregate<ReportViewAggregate>([
          {
            $match: {
              ownerId,
              ...buildIssueDateFilter(range),
            },
          },
          {
            $facet: {
              summary: [
                {
                  $group: {
                    _id: null,
                    documentCount: { $sum: 1 },
                    totalGrandTotal: { $sum: '$totals.grandTotal' },
                    totalTax: { $sum: '$totals.totalTax' },
                    totalDiscount: { $sum: '$totals.totalDiscount' },
                  },
                },
              ],
              documents: [
                {
                  $sort: { issueDate: -1, createdAt: -1 },
                },
              ],
            },
          },
        ])
        .toArray();

      return result[0] ?? { summary: [], documents: [] };
    },
  };
}
