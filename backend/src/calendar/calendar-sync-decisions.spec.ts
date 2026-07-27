import { BookingStatus } from '@prisma/client';
import {
  shouldRemoveBookingFromCalendar,
  shouldSyncBookingToCalendar,
} from './calendar-sync-decisions';

describe('shouldSyncBookingToCalendar', () => {
  it('fires for a CONFIRMED Booking on a Google-linked Account', () => {
    expect(shouldSyncBookingToCalendar(BookingStatus.CONFIRMED, true)).toBe(
      true,
    );
  });

  it('does not fire for a PENDING_APPROVAL Booking', () => {
    expect(shouldSyncBookingToCalendar(BookingStatus.PENDING_APPROVAL, true)).toBe(
      false,
    );
  });

  it('does not fire for a User with no Google account linked, even if CONFIRMED', () => {
    expect(shouldSyncBookingToCalendar(BookingStatus.CONFIRMED, false)).toBe(
      false,
    );
  });
});

describe('shouldRemoveBookingFromCalendar', () => {
  it('fires when a synced Booking is REJECTED', () => {
    expect(
      shouldRemoveBookingFromCalendar(BookingStatus.REJECTED, 'evt-1'),
    ).toBe(true);
  });

  it('fires when a synced Booking is CANCELLED', () => {
    expect(
      shouldRemoveBookingFromCalendar(BookingStatus.CANCELLED, 'evt-1'),
    ).toBe(true);
  });

  it('does not fire when there is no Calendar event to remove', () => {
    expect(
      shouldRemoveBookingFromCalendar(BookingStatus.CANCELLED, null),
    ).toBe(false);
  });

  it('does not fire for a CONFIRMED Booking', () => {
    expect(
      shouldRemoveBookingFromCalendar(BookingStatus.CONFIRMED, 'evt-1'),
    ).toBe(false);
  });
});
