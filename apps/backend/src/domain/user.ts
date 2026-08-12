import type { ObjectId } from 'mongodb';

/**
 * Persisted user record.
 *
 * Domain type discipline: this file imports nothing but driver types, mirroring
 * `src/pricing`'s framework-agnostic domain types.
 */
export interface User {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
}
