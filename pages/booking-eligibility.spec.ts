import { describe, it, expect } from 'vitest';
import { isActiveSlot, isEditable, isDeletable } from './booking-eligibility';
import { Booking } from '../types';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    roomId: 'r1',
    userId: 'u1',
    userName: 'Test User',
    title: 'Test Booking',
    startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    status: 'CONFIRMED',
    ...overrides,
  };
}

describe('isActiveSlot', () => {
  it('is active when CONFIRMED', () => {
    expect(isActiveSlot('CONFIRMED')).toBe(true);
  });

  it('is active when PENDING_APPROVAL', () => {
    expect(isActiveSlot('PENDING_APPROVAL')).toBe(true);
  });

  it('is not active when CANCELLED', () => {
    expect(isActiveSlot('CANCELLED')).toBe(false);
  });

  it('is not active when REJECTED', () => {
    expect(isActiveSlot('REJECTED')).toBe(false);
  });
});

describe('isEditable', () => {
  it('is editable when future and CONFIRMED', () => {
    expect(isEditable(makeBooking({ status: 'CONFIRMED' }))).toBe(true);
  });

  it('is editable when future and PENDING_APPROVAL', () => {
    expect(isEditable(makeBooking({ status: 'PENDING_APPROVAL' }))).toBe(true);
  });

  it('is not editable when REJECTED, even if future', () => {
    expect(isEditable(makeBooking({ status: 'REJECTED' }))).toBe(false);
  });

  it('is not editable when CANCELLED, even if future', () => {
    expect(isEditable(makeBooking({ status: 'CANCELLED' }))).toBe(false);
  });

  it('is not editable when the Booking has already started (in-progress)', () => {
    const booking = makeBooking({
      status: 'CONFIRMED',
      startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    expect(isEditable(booking)).toBe(false);
  });

  it('is not editable when the Booking is entirely in the past', () => {
    const booking = makeBooking({
      status: 'CONFIRMED',
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(isEditable(booking)).toBe(false);
  });
});

describe('isDeletable', () => {
  it('is deletable when the Booking has not started yet, regardless of status', () => {
    expect(isDeletable(makeBooking({ status: 'PENDING_APPROVAL' }))).toBe(true);
    expect(isDeletable(makeBooking({ status: 'REJECTED' }))).toBe(true);
  });

  it('is not deletable once the Booking has started (in-progress)', () => {
    const booking = makeBooking({
      startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    expect(isDeletable(booking)).toBe(false);
  });

  it('is not deletable once the Booking is entirely in the past', () => {
    const booking = makeBooking({
      startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(isDeletable(booking)).toBe(false);
  });
});
