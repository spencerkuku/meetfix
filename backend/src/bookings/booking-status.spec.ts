import { BookingStatus } from '@prisma/client';
import { ACTIVE_BOOKING_STATUSES, isActiveBooking } from './booking-status';

describe('isActiveBooking', () => {
  it('is active when CONFIRMED', () => {
    expect(isActiveBooking(BookingStatus.CONFIRMED)).toBe(true);
  });

  it('is active when PENDING_APPROVAL', () => {
    expect(isActiveBooking(BookingStatus.PENDING_APPROVAL)).toBe(true);
  });

  it('is not active when CANCELLED', () => {
    expect(isActiveBooking(BookingStatus.CANCELLED)).toBe(false);
  });

  it('is not active when REJECTED', () => {
    expect(isActiveBooking(BookingStatus.REJECTED)).toBe(false);
  });
});

describe('ACTIVE_BOOKING_STATUSES', () => {
  it('contains exactly the statuses isActiveBooking accepts', () => {
    expect(ACTIVE_BOOKING_STATUSES.sort()).toEqual(
      [BookingStatus.CONFIRMED, BookingStatus.PENDING_APPROVAL].sort(),
    );
  });
});
