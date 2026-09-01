import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  RepairStatus,
  RepairTicket,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RepairTicketInput } from './repair-ticket-form.dto';
import { UpdateRepairTicketDto } from './update-repair-ticket.dto';
import { UpdateRepairTicketContentDto } from './update-repair-ticket-content.dto';
import { withUserName } from '../common/with-user-name';
import { assertOwnerOrAdmin } from '../common/assert-owner-or-admin';
import { assertReporterInfoComplete } from '../common/assert-reporter-info-complete';
import {
  canSeeReporterDetails,
  maskName,
  nextRepairStatus,
  revertRepairStatus,
} from 'repair-visibility';
import { buildRepairExportCsv } from './repair-export.csv';

export type RepairTicketWithUserName = RepairTicket & {
  userName: string;
  resolvedByName: string | null;
};

// Shared by the two call sites where a ticket can only ever be PENDING
// (create) — it can't have a resolver yet, so there's no need to query
// findResolvedByNames() for a single-ticket null result.
function withNoResolver<T extends { user: { name: string } }>(
  ticket: T,
): ReturnType<typeof withUserName<T>> & { resolvedByName: null } {
  return { ...withUserName(ticket), resolvedByName: null };
}

@Injectable()
export class RepairsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    callerId: string,
    callerRole: Role,
  ): Promise<RepairTicketWithUserName[]> {
    const tickets = await this.prisma.repairTicket.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
    const resolvedByNames = await this.findResolvedByNames(tickets);
    return tickets.map((ticket) => {
      const withName = {
        ...withUserName(ticket),
        resolvedByName: resolvedByNames.get(ticket.id) ?? null,
      };
      if (canSeeReporterDetails(callerRole, callerId, ticket.userId)) {
        return withName;
      }
      return {
        ...withName,
        userPhone: null,
        userClass: null,
        userName: maskName(withName.userName),
      };
    });
  }

  // "維修人員" — whoever performed the most recent status transition into
  // COMPLETED, per Repair Ticket, read from the Audit Log Entry trail
  // rather than a dedicated column: CONTEXT.md is explicit that there is no
  // per-ticket assignee field (any FACILITY_MANAGER/ADMIN can pick up any
  // ticket from the shared queue), and the audit trail already holds this
  // exact "who did what, when" history. Only COMPLETED tickets have an
  // entry; a ticket completed, reverted, then completed again by someone
  // else resolves to the latest completer. Mirrors the actor?.name ??
  // actorName fallback in AuditService for a deleted actor's User row.
  private async findResolvedByNames(
    tickets: Pick<RepairTicket, 'id' | 'status'>[],
  ): Promise<Map<string, string>> {
    const completedIds = tickets
      .filter((ticket) => ticket.status === RepairStatus.COMPLETED)
      .map((ticket) => ticket.id);
    if (completedIds.length === 0) return new Map();

    const entries = await this.prisma.auditLogEntry.findMany({
      where: {
        targetType: 'RepairTicket',
        targetId: { in: completedIds },
        action: AuditAction.REPAIR_STATUS_CHANGE,
        detail: { endsWith: 'to COMPLETED' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { actor: { select: { name: true } } },
    });

    const resolvedByNames = new Map<string, string>();
    for (const entry of entries) {
      if (resolvedByNames.has(entry.targetId)) continue; // already the latest
      resolvedByNames.set(
        entry.targetId,
        entry.actor?.name ?? entry.actorName ?? '已刪除使用者',
      );
    }
    return resolvedByNames;
  }

  async create(
    userId: string,
    dto: RepairTicketInput,
    imageUrl?: string,
  ): Promise<RepairTicketWithUserName> {
    if (!dto.location || !dto.category || !dto.description) {
      throw new BadRequestException(
        'location, category and description are required',
      );
    }
    assertReporterInfoComplete(dto.userClass, dto.userPhone);

    const category = await this.prisma.repairCategory.findUnique({
      where: { name: dto.category },
    });
    if (!category) {
      throw new BadRequestException('Unknown Repair Category');
    }

    // Reporter info also lands on the User row itself (see User.userClass/
    // userPhone), so it pre-fills the next Repair Ticket — same transaction
    // as ticket creation, so the two never disagree.
    const [created] = await this.prisma.$transaction([
      this.prisma.repairTicket.create({
        data: { ...dto, userId, imageUrl },
        include: { user: { select: { name: true } } },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { userClass: dto.userClass, userPhone: dto.userPhone },
      }),
    ]);
    return withNoResolver(created);
  }

  async updateStatus(
    actorId: string,
    id: string,
    updates: UpdateRepairTicketDto,
  ): Promise<RepairTicketWithUserName> {
    const existingTicket = await this.prisma.repairTicket.findUnique({
      where: { id },
    });
    if (!existingTicket || existingTicket.deletedAt) {
      throw new NotFoundException('Repair Ticket not found');
    }
    const previousStatus = existingTicket.status;

    const data: Prisma.RepairTicketUpdateInput = {};
    if (updates.status !== undefined) {
      const isForward = nextRepairStatus(previousStatus) === updates.status;
      const isBackward =
        revertRepairStatus(previousStatus) === updates.status;
      if (!isForward && !isBackward) {
        throw new BadRequestException(
          `Cannot transition a ${previousStatus} Repair Ticket to ${updates.status}`,
        );
      }
      data.status = updates.status;
    }
    if (updates.adminReply !== undefined) {
      data.adminReply = updates.adminReply;
    }

    const updated = await this.audit.runAuditedTransaction(
      async (tx) => {
        // Conditional on status, not just id, so two concurrent
        // updateStatus() calls against the same ticket (e.g. one reverting,
        // one advancing) can't both commit — only the first to commit wins,
        // and the loser's would-be Audit Log Entry is never written.
        // Mirrors BookingsService.decide()'s equivalent guard.
        const result = await tx.repairTicket.updateMany({
          where: { id, status: previousStatus, deletedAt: null },
          data,
        });
        if (result.count === 0) {
          throw new ConflictException(
            'Repair Ticket status changed concurrently; reload and retry',
          );
        }
        return tx.repairTicket.findUniqueOrThrow({
          where: { id },
          include: { user: true },
        });
      },
      updates.status !== undefined
        ? {
            actorId,
            action: AuditAction.REPAIR_STATUS_CHANGE,
            targetType: 'RepairTicket',
            targetId: id,
            detail: `Status changed from ${previousStatus} to ${updates.status}`,
          }
        : null,
    );
    const resolvedByNames = await this.findResolvedByNames([updated]);
    return {
      ...withUserName(updated),
      resolvedByName: resolvedByNames.get(updated.id) ?? null,
    };
  }

  // Reporter-side content edit — distinct from updateStatus() above (which
  // stays FACILITY_MANAGER/ADMIN-only, status+adminReply only). Only a PENDING
  // Repair Ticket can be edited — once a FACILITY_MANAGER has picked it up
  // (IN_PROGRESS) or finished it (COMPLETED), the reporter's content is
  // locked, mirroring how a Booking becomes locked once it starts. See
  // issue #25.
  async updateContent(
    actorId: string,
    actorRole: Role,
    id: string,
    dto: UpdateRepairTicketContentDto,
    imageUrl?: string,
  ): Promise<RepairTicketWithUserName> {
    const existing = await this.prisma.repairTicket.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Repair Ticket not found');
    }
    assertOwnerOrAdmin(
      existing,
      actorId,
      actorRole,
      'You can only edit your own Repair Tickets',
    );

    if (dto.category !== undefined) {
      const category = await this.prisma.repairCategory.findUnique({
        where: { name: dto.category },
      });
      if (!category) {
        throw new BadRequestException('Unknown Repair Category');
      }
    }

    const data: Prisma.RepairTicketUpdateInput = {
      ...(dto.location !== undefined ? { location: dto.location } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      // A newly-uploaded photo always wins over an explicit removal request.
      ...(imageUrl !== undefined
        ? { imageUrl }
        : dto.removePhoto
          ? { imageUrl: null }
          : {}),
    };

    // Conditional on status, not just id, so a concurrent FACILITY_MANAGER claim
    // (updateStatus PENDING -> IN_PROGRESS) racing this edit can't both
    // proceed — only the first to commit wins.
    const result = await this.prisma.repairTicket.updateMany({
      where: { id, status: RepairStatus.PENDING, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Only a PENDING Repair Ticket can be edited',
      );
    }
    const updated = await this.prisma.repairTicket.findUniqueOrThrow({
      where: { id },
      include: { user: true },
    });
    return withNoResolver(updated);
  }

  // Soft-deletes a still-PENDING Repair Ticket. A genuinely new capability —
  // unlike Booking, Repair Ticket had no deletion path at all before
  // issue #25. Same PENDING-only eligibility as updateContent() above.
  async remove(actorId: string, actorRole: Role, id: string): Promise<void> {
    const existing = await this.prisma.repairTicket.findUnique({
      where: { id },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Repair Ticket not found');
    }
    assertOwnerOrAdmin(
      existing,
      actorId,
      actorRole,
      'You can only delete your own Repair Tickets',
    );

    const result = await this.prisma.repairTicket.updateMany({
      where: { id, status: RepairStatus.PENDING, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Only a PENDING Repair Ticket can be deleted',
      );
    }
  }

  // FACILITY_MANAGER/ADMIN-only export (enforced by the controller's
  // RolesGuard). Deliberately excludes the reporter relation — the export
  // is a bulk operational report, not a reporter directory, so it never
  // touches userName/userClass/userPhone (see repair-export.csv.ts).
  // `from`/`to` are inclusive createdAt bounds; omitting both returns every
  // non-deleted Repair Ticket.
  async findForExport(from?: Date, to?: Date): Promise<RepairTicket[]> {
    return this.prisma.repairTicket.findMany({
      where: {
        deletedAt: null,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Wraps findForExport() with the CSV rendering and the Audit Log Entry
  // required by CONTEXT.md's (deliberately widened) Audit Log Entry
  // definition — a bulk export of Repair Ticket data is sensitive enough to
  // record even though it's read-only and PII-free. Not run inside
  // runAuditedTransaction() since there is no state change to make atomic
  // with; a plain record() write after the read is enough.
  async exportCsv(
    actorId: string,
    actorRole: Role,
    from?: Date,
    to?: Date,
  ): Promise<{ csv: string; count: number }> {
    const tickets = await this.findForExport(from, to);
    const resolvedByNames = await this.findResolvedByNames(tickets);
    await this.audit.record(
      actorId,
      AuditAction.REPAIR_EXPORT,
      'RepairExport',
      'all',
      JSON.stringify({
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
        count: tickets.length,
        actorRole,
      }),
    );
    return {
      csv: buildRepairExportCsv(tickets, resolvedByNames),
      count: tickets.length,
    };
  }

  findAllCategories() {
    return this.prisma.repairCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(name: string) {
    if (!name?.trim()) {
      throw new BadRequestException('name is required');
    }
    try {
      return await this.prisma.repairCategory.create({
        data: { name: name.trim() },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('This category already exists');
      }
      throw err;
    }
  }

  async removeCategory(id: string): Promise<void> {
    const category = await this.prisma.repairCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Repair Category not found');
    }
    await this.prisma.repairCategory.delete({ where: { id } });
  }
}
