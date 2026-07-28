import { Role } from '@prisma/client';

// Whether `callerId` may see a Repair Ticket reporter's phone, class, and
// unmasked name. ADMIN and MAINTENANCE see every reporter's details (they
// need it to act on the ticket); everyone else only sees their own.
export function canSeeReporterDetails(
  callerRole: Role,
  callerId: string,
  ticketUserId: string,
): boolean {
  const privileged = callerRole === Role.ADMIN || callerRole === Role.MAINTENANCE;
  return privileged || callerId === ticketUserId;
}
