import { ForbiddenException } from '@nestjs/common';
import { Booking, Role } from '@prisma/client';

// Whether `userId` may act on `booking` — the owner themselves, or an
// ADMIN. Shared by cancel() and remove(), which enforce the same
// ownership rule for two distinct actions (see CONTEXT.md's Booking
// Deletion entry).
export function assertOwnerOrAdmin(
  booking: Booking,
  userId: string,
  role: Role,
  message = 'You can only act on your own Bookings',
): void {
  if (booking.userId !== userId && role !== Role.ADMIN) {
    throw new ForbiddenException(message);
  }
}
