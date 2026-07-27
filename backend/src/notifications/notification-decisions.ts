import { BookingStatus } from '@prisma/client';

// Pure decision logic for whether a notification email should fire, kept
// separate from NotificationsService's actual send call so it's
// unit-testable without SMTP or a database. See CONTEXT.md / issue #10.

export function shouldNotifyBookingSubmittedForApproval(
  status: BookingStatus,
): boolean {
  return status === BookingStatus.PENDING_APPROVAL;
}

export function shouldNotifyBookingCancelled(
  bookingUserId: string,
  cancelledByUserId: string,
): boolean {
  return cancelledByUserId !== bookingUserId;
}

export function shouldNotifyRepairUpdate(updates: {
  status?: unknown;
  adminReply?: unknown;
}): boolean {
  return updates.status !== undefined || updates.adminReply !== undefined;
}
