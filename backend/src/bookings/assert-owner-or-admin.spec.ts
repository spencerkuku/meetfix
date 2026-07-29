import { ForbiddenException } from '@nestjs/common';
import { Booking, Role } from '@prisma/client';
import { assertOwnerOrAdmin } from './assert-owner-or-admin';

function booking(userId: string): Booking {
  return { userId } as Booking;
}

describe('assertOwnerOrAdmin', () => {
  it('passes when the caller owns the Booking', () => {
    expect(() =>
      assertOwnerOrAdmin(booking('user-1'), 'user-1', Role.USER),
    ).not.toThrow();
  });

  it('passes when the caller is an ADMIN, regardless of ownership', () => {
    expect(() =>
      assertOwnerOrAdmin(booking('owner-1'), 'caller-1', Role.ADMIN),
    ).not.toThrow();
  });

  it('passes when the caller is both the owner and an ADMIN', () => {
    expect(() =>
      assertOwnerOrAdmin(booking('user-1'), 'user-1', Role.ADMIN),
    ).not.toThrow();
  });

  it('throws when the caller neither owns the Booking nor is an ADMIN', () => {
    expect(() =>
      assertOwnerOrAdmin(booking('owner-1'), 'caller-1', Role.USER),
    ).toThrow(ForbiddenException);
  });

  it('throws with the supplied message', () => {
    expect(() =>
      assertOwnerOrAdmin(
        booking('owner-1'),
        'caller-1',
        Role.USER,
        'custom message',
      ),
    ).toThrow('custom message');
  });
});
