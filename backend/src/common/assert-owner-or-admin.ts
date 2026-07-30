import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

// Whether `userId` may act on a User-owned record (a Booking, a Repair
// Ticket, ...) — the owner themselves, or an ADMIN. Shared by any service
// enforcing this same ownership rule (see CONTEXT.md's Booking Deletion
// entry, and its Repair Ticket editing/deletion equivalent).
export function assertOwnerOrAdmin(
  record: { userId: string },
  userId: string,
  role: Role,
  message = 'You can only act on your own records',
): void {
  if (record.userId !== userId && role !== Role.ADMIN) {
    throw new ForbiddenException(message);
  }
}
