import { BookingStatus } from '@prisma/client';
import {
  shouldNotifyBookingCancelled,
  shouldNotifyBookingSubmittedForApproval,
  shouldNotifyRepairUpdate,
} from './notification-decisions';

describe('shouldNotifyBookingSubmittedForApproval', () => {
  it('fires when the Booking is PENDING_APPROVAL', () => {
    expect(
      shouldNotifyBookingSubmittedForApproval(BookingStatus.PENDING_APPROVAL),
    ).toBe(true);
  });

  it('does not fire when the Booking is auto-confirmed', () => {
    expect(
      shouldNotifyBookingSubmittedForApproval(BookingStatus.CONFIRMED),
    ).toBe(false);
  });
});

describe('shouldNotifyBookingCancelled', () => {
  it('fires when someone other than the requester cancels', () => {
    expect(shouldNotifyBookingCancelled('user-1', 'admin-1')).toBe(true);
  });

  it('does not fire when the requester cancels their own Booking', () => {
    expect(shouldNotifyBookingCancelled('user-1', 'user-1')).toBe(false);
  });
});

describe('shouldNotifyRepairUpdate', () => {
  it('fires on a status transition', () => {
    expect(shouldNotifyRepairUpdate({ status: 'IN_PROGRESS' })).toBe(true);
  });

  it('fires on a reply-only update', () => {
    expect(shouldNotifyRepairUpdate({ adminReply: '已處理' })).toBe(true);
  });

  it('fires when both status and reply are updated together', () => {
    expect(
      shouldNotifyRepairUpdate({ status: 'COMPLETED', adminReply: '完成' }),
    ).toBe(true);
  });

  it('does not fire on an empty update', () => {
    expect(shouldNotifyRepairUpdate({})).toBe(false);
  });
});
