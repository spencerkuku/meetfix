import { Prisma } from '@prisma/client';

// `$transaction` options for a check-then-act sequence that needs Postgres
// to detect a write-skew conflict between two concurrent transactions,
// rather than silently letting both commit. Used by AdminService's
// last-Admin guard; BookingsService's own Slot Conflict check uses the same
// isolation level inline (pre-dates this file, left as-is to avoid an
// unrelated reformat of that code).
export const SERIALIZABLE_TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};
