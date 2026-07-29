// The Role values a caller may hold. This package can't import the
// backend's Prisma-generated Role enum without taking on a Prisma
// dependency just to type one parameter, so it keeps its own copy of the
// four domain Role values (see CONTEXT.md), plus the frontend-only GUEST
// pseudo-role for a not-yet-authenticated caller.
export type CallerRole =
  | 'USER'
  | 'MAINTENANCE'
  | 'ROOM_MANAGER'
  | 'ADMIN'
  | 'GUEST';

// Whether `callerId` may see a Repair Ticket reporter's phone, class, and
// unmasked name. ADMIN and MAINTENANCE see every reporter's details (they
// need it to act on the ticket); everyone else only sees their own.
export function canSeeReporterDetails(
  callerRole: CallerRole,
  callerId: string,
  ticketUserId: string,
): boolean {
  const privileged = callerRole === 'ADMIN' || callerRole === 'MAINTENANCE';
  return privileged || callerId === ticketUserId;
}

// Mask name: 陳小美 -> 陳O美, 王大明 -> 王O明, Jo -> Jo. The backend's
// server-enforced mask and the frontend's display-only mask must always
// visibly agree, so both import this one implementation.
export function maskName(name: string): string {
  if (!name || name.length < 2) return name;
  if (name.length === 2) return name[0] + 'O';
  return name[0] + 'O' + name.slice(2);
}
