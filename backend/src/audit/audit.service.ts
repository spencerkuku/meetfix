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

  async findAll() {
    const entries = await this.prisma.auditLogEntry.findMany({
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return entries.map(toAuditLogEntryResponse);
  }
}
