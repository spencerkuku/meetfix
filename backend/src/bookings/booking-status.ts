import { BookingStatus } from '@prisma/client';

// Whether a Booking in this status still holds its Room's time slot. Shared
// by Slot Conflict detection and Calendar sync so "active" can't drift
// between the two — see CONTEXT.md's Booking Status / Slot Conflict entries.
export function isActiveBooking(status: BookingStatus): boolean {
  return (
    status === BookingStatus.CONFIRMED ||
    status === BookingStatus.PENDING_APPROVAL
  );
}

// Same predicate, shaped for Prisma's `status: { in: [...] }` filters.
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = Object.values(
  BookingStatus,
).filter(isActiveBooking);
