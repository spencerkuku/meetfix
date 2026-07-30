import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertOwnerOrAdmin } from './assert-owner-or-admin';

function record(userId: string): { userId: string } {
  return { userId };
}

describe('assertOwnerOrAdmin', () => {
  it('passes when the caller owns the record', () => {
    expect(() =>
      assertOwnerOrAdmin(record('user-1'), 'user-1', Role.USER),
    ).not.toThrow();
  });

  it('passes when the caller is an ADMIN, regardless of ownership', () => {
    expect(() =>
      assertOwnerOrAdmin(record('owner-1'), 'caller-1', Role.ADMIN),
    ).not.toThrow();
  });

  it('passes when the caller is both the owner and an ADMIN', () => {
    expect(() =>
      assertOwnerOrAdmin(record('user-1'), 'user-1', Role.ADMIN),
    ).not.toThrow();
  });

  it('throws when the caller neither owns the record nor is an ADMIN', () => {
    expect(() =>
      assertOwnerOrAdmin(record('owner-1'), 'caller-1', Role.USER),
    ).toThrow(ForbiddenException);
  });

  it('throws with the supplied message', () => {
    expect(() =>
      assertOwnerOrAdmin(
        record('owner-1'),
        'caller-1',
        Role.USER,
        'custom message',
      ),
    ).toThrow('custom message');
  });
});
