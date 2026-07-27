import { Injectable } from '@nestjs/common';
import { AuditAction, AuditLogEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaClientOrTx = PrismaService | Prisma.TransactionClient;

function toAuditLogEntryResponse(
  entry: AuditLogEntry & { actor: { name: string; email: string } },
) {
  const { actor, ...rest } = entry;
  return { ...rest, actorName: actor.name, actorEmail: actor.email };
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
  async runAuditedTransaction<T>(
    mutate: (tx: Prisma.TransactionClient) => Promise<T>,
    auditEntry: AuditEntry | null,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const result = await mutate(tx);
      if (auditEntry) {
        await this.record(
          auditEntry.actorId,
          auditEntry.action,
          auditEntry.targetType,
          auditEntry.targetId,
          auditEntry.detail,
          tx,
        );
      }
      return result;
    });
  }

  async findAll() {
    const entries = await this.prisma.auditLogEntry.findMany({
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return entries.map(toAuditLogEntryResponse);
  }
}
