import { Booking } from '../types';

// Whether a Booking Status still holds its Slot. Mirrors the backend's
// isActiveBooking (backend/src/bookings/booking-status.ts) exactly — kept
// as a local string-literal check rather than importing across the
// frontend/backend boundary, since the two are separate runtimes; see
// CONTEXT.md's Booking Status entry for the CONFIRMED/PENDING_APPROVAL rule.
export function isActiveSlot(status: Booking['status']): boolean {
  return status === 'CONFIRMED' || status === 'PENDING_APPROVAL';
}

// Whether `booking` can currently be edited: still holds its Slot, and
// hasn't started yet. Per CONTEXT.md's Booking Editing entry, a past,
// in-progress, REJECTED, or CANCELLED Booking cannot be edited.
export function isEditable(booking: Booking, now: Date = new Date()): boolean {
  return new Date(booking.startTime) > now && isActiveSlot(booking.status);
}

// Whether `booking` can currently be deleted: hasn't started yet, regardless
// of its status. Per CONTEXT.md's Booking Deletion entry, this is the only
// self-service way to give up a Booking of any status — a past or
// in-progress Booking cannot be deleted.
export function isDeletable(booking: Booking, now: Date = new Date()): boolean {
  return new Date(booking.startTime) > now;
}

// Whether `booking` can currently be reverted (Booking Revert, undoing a
// Booking Approval decision). Mirrors the backend's BookingsService.revert()
// gate exactly: eligibility is keyed on `reviewedAt`, not status alone,
// because Room.requiresApproval may have changed since the decision was
// made, so `reviewedAt` is the only way to tell a reviewed CONFIRMED apart
// from one that was auto-CONFIRMED (Room never required approval). No
// `deletedAt` check, mirroring isEditable/isDeletable above — frontend
// Booking state doesn't carry soft-deleted rows.
export function isRevertible(booking: Booking): boolean {
  return !!booking.reviewedAt && (booking.status === 'CONFIRMED' || booking.status === 'REJECTED');
}

// Whether `booking` has not yet ended — status-agnostic, end-time-based.
// Deliberately distinct from isEditable (which is start-time-based and
// requires an active status): this answers "is there still something to
// look at here," used to decide whether a Booking's details are worth
// showing at all, independent of whether they can still be edited.
export function hasNotEnded(booking: Booking, now: Date = new Date()): boolean {
  return new Date(booking.endTime) > now;
}

// Whether two time ranges overlap, per CONTEXT.md's Slot Conflict entry: a
// range that merely touches another at a boundary (one's end equals the
// other's start) does not count as overlapping. The frontend's single
// definition of this comparison — BookingFormModal's availability pre-check
// and BookingCalendarGrid's slot rendering both call this instead of each
// restating it. The backend's own Slot Conflict check (assertNoSlotConflict)
// expresses the same rule as a Prisma query, not a callable predicate over
// two Dates, so it isn't unified with this function.
export function rangesOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start < b.end && a.end > b.start;
}
