import { Prisma } from '@prisma/client';

// Postgres aborts the losing side of a write-skew conflict detected under
// SERIALIZABLE isolation (and, separately, either side of a plain lock-wait
// deadlock) rather than let it commit an inconsistent result. Prisma
// surfaces both as the documented P2034 ("Transaction failed due to a write
// conflict or a deadlock"). The message-substring check is a fallback in
// case a given Prisma/Postgres version routes the error through
// PrismaClientUnknownRequestError instead. Shared by every service that
// wraps a check-then-act sequence in a Serializable transaction (see
// BookingsService, AdminService).
export function isSerializationFailure(err: unknown): boolean {
  return (
    (err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2034') ||
    (err instanceof Prisma.PrismaClientUnknownRequestError &&
      (err.message.includes('could not serialize access') ||
        err.message.includes('deadlock detected')))
  );
}
