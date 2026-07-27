import { AccountProvider, BookingStatus } from '@prisma/client';

// Pure decision logic for whether a Google Calendar sync should happen, and
// on which existing event — kept separate from CalendarService's actual
// Google API calls so it's unit-testable without network access or a real
// OAuth token. See CONTEXT.md / issue #11.

export function shouldSyncBookingToCalendar(
  bookingStatus: BookingStatus,
  accountProvider: AccountProvider,
): boolean {
  return (
    bookingStatus === BookingStatus.CONFIRMED &&
    accountProvider === AccountProvider.GOOGLE
  );
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
