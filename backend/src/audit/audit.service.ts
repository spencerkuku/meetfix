import { Injectable } from '@nestjs/common';
import { AuditAction, AuditLogEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

// `actor` is null once a User Deletion has removed the actor's row (FK
// onDelete: SetNull) — fall back to the `actorName` snapshot taken at
// deletion time (see AdminService.deleteUser) instead of crashing on a
// null dereference. There's no equivalent email snapshot, so that field
// goes blank for a deleted actor.
function toAuditLogEntryResponse(
  entry: AuditLogEntry & { actor: { name: string; email: string } | null },
) {
  const { actor, actorName, ...rest } = entry;
  return {
    ...rest,
    actorName: actor?.name ?? actorName ?? '已刪除使用者',
    actorEmail: actor?.email ?? '',
  };
}

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  detail?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Accepts an optional transaction client so the audit write can be
  // committed atomically with the state change it records — a Role change,
  // Booking Approval, Account Approval or Repair Status change must never
  // persist without a matching entry. See CONTEXT.md.
  record(
    actorId: string,
    action: AuditAction,
    targetType: string,
    targetId: string,
    detail?: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.auditLogEntry.create({
      data: { actorId, action, targetType, targetId, detail },
    });
  }

  // Runs `mutate` inside a transaction and, if `entry` (given the mutation's
  // result) returns one, records the matching Audit Log Entry atomically
  // with it — a Role change, Booking Approval, Account Approval or Repair
  // Status change must never persist without its Audit Log Entry, and vice
  // versa. Shared by every service that pairs a state change with an audit
  // record, so that choreography lives in one place instead of being
  // hand-copied per caller. See CONTEXT.md.
  // `options` is threaded straight through to Prisma's `$transaction` — a
  // caller that also needs to re-check an invariant (e.g. "at least one
  // Admin remains") against data the write doesn't itself touch can request
  // Serializable isolation so Postgres detects the write-skew conflict that
  // Read Committed (the default) would silently miss. See AdminService.
  async runAuditedTransaction<T>(
    mutate: (tx: Prisma.TransactionClient) => Promise<T>,
    auditEntry: AuditEntry | null | ((result: T) => AuditEntry | null),
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const result = await mutate(tx);
      const entry =
        typeof auditEntry === 'function' ? auditEntry(result) : auditEntry;
      if (entry) {
        await this.record(
          entry.actorId,
          entry.action,
          entry.targetType,
          entry.targetId,
          entry.detail,
          tx,
        );
      }
      return result;
    }, options);
  }

  async findAll() {
    const entries = await this.prisma.auditLogEntry.findMany({
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return entries.map(toAuditLogEntryResponse);
  }
}
