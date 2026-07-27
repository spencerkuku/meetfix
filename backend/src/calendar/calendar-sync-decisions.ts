import { BookingStatus } from '@prisma/client';

// Pure decision logic for whether a Google Calendar sync should happen, and
// on which existing event — kept separate from CalendarService's actual
// Google API calls so it's unit-testable without network access or a real
// OAuth token. See CONTEXT.md / issue #11.
//
// Eligibility is based on whether the Account has a Google identity linked
// (googleSub/googleRefreshToken present), not on how the User originally
// registered — a password Account can link Google later and becomes
// eligible immediately.

export function shouldSyncBookingToCalendar(
  bookingStatus: BookingStatus,
  isGoogleLinked: boolean,
): boolean {
  return bookingStatus === BookingStatus.CONFIRMED && isGoogleLinked;
}

export function shouldRemoveBookingFromCalendar(
  bookingStatus: BookingStatus,
  googleEventId: string | null,
): boolean {
  return (
    (bookingStatus === BookingStatus.REJECTED ||
      bookingStatus === BookingStatus.CANCELLED) &&
    googleEventId !== null
  );
}
