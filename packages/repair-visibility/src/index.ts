// The Role values a caller may hold. This package can't import the
// backend's Prisma-generated Role enum without taking on a Prisma
// dependency just to type one parameter, so it keeps its own copy of the
// three domain Role values (see CONTEXT.md), plus the frontend-only GUEST
// pseudo-role for a not-yet-authenticated caller.
export type CallerRole = 'USER' | 'FACILITY_MANAGER' | 'ADMIN' | 'GUEST';

// Whether `callerId` may see a Repair Ticket reporter's phone, class, and
// unmasked name. ADMIN and FACILITY_MANAGER see every reporter's details
// (they need it to act on the ticket); everyone else only sees their own.
export function canSeeReporterDetails(
  callerRole: CallerRole,
  callerId: string,
  ticketUserId: string,
): boolean {
  const privileged = callerRole === 'ADMIN' || callerRole === 'FACILITY_MANAGER';
  return privileged || callerId === ticketUserId;
}

// The Repair Ticket lifecycle (see CONTEXT.md). Kept as a local string union
// for the same reason as CallerRole above — no Prisma dependency just to
// type a parameter.
export type RepairStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

const FORWARD_STEPS: Record<RepairStatusValue, RepairStatusValue | null> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: null,
};

const REVERT_STEPS: Record<RepairStatusValue, RepairStatusValue | null> = {
  PENDING: null,
  IN_PROGRESS: 'PENDING',
  COMPLETED: 'IN_PROGRESS',
};

// The status a Repair Ticket advances to on its next forward action (接手處理
// / 標記完成), or null once it's COMPLETED. Forward actions don't need
// confirmation — see revertRepairStatus for the direction that does.
export function nextRepairStatus(
  current: RepairStatusValue,
): RepairStatusValue | null {
  return FORWARD_STEPS[current];
}

// The status a Repair Ticket falls back to on a revert action (退回待處理 /
// 重新開啟), or null from PENDING (nothing to revert to). Reverts always go
// through a confirmation step, and this is also the "undo" target right
// after a forward action — undoing IN_PROGRESS always means going back to
// whatever forward() moved it from.
export function revertRepairStatus(
  current: RepairStatusValue,
): RepairStatusValue | null {
  return REVERT_STEPS[current];
}

// Mask name: 陳小美 -> 陳O美, 王大明 -> 王O明, Jo -> Jo. The backend's
// server-enforced mask and the frontend's display-only mask must always
// visibly agree, so both import this one implementation.
export function maskName(name: string): string {
  if (!name || name.length < 2) return name;
  if (name.length === 2) return name[0] + 'O';
  return name[0] + 'O' + name.slice(2);
}
