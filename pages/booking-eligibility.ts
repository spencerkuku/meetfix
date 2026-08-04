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
