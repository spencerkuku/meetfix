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
import { canSeeReporterDetails, maskName } from 'repair-visibility';

// Repair Status advances one step at a time — see CONTEXT.md. A ticket's
// current status maps to the single status it can next become; `undefined`
// means no further forward transition is possible from there.
const NEXT_STATUS: Record<RepairStatus, RepairStatus | undefined> = {
  [RepairStatus.PENDING]: RepairStatus.IN_PROGRESS,
  [RepairStatus.IN_PROGRESS]: RepairStatus.COMPLETED,
  [RepairStatus.COMPLETED]: undefined,
};

// A FACILITY_MANAGER/ADMIN user can also walk a ticket back one step — e.g. to
// undo a wrong "接手處理"/"標記完成" click, or reopen a ticket closed too
// soon. Only ever one step, mirroring NEXT_STATUS above: COMPLETED can only
// go back to IN_PROGRESS, never straight to PENDING.
const PREV_STATUS: Record<RepairStatus, RepairStatus | undefined> = {
  [RepairStatus.PENDING]: undefined,
  [RepairStatus.IN_PROGRESS]: RepairStatus.PENDING,
  [RepairStatus.COMPLETED]: RepairStatus.IN_PROGRESS,
};

export type RepairTicketWithUserName = RepairTicket & { userName: string };

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
    return tickets.map((ticket) => {
      const withName = withUserName(ticket);
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
    return withUserName(created);
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
      const isForward = NEXT_STATUS[previousStatus] === updates.status;
      const isBackward = PREV_STATUS[previousStatus] === updates.status;
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
      (tx) =>
        tx.repairTicket.update({
          where: { id },
          data,
          include: { user: true },
        }),
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
    return withUserName(updated);
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
    return withUserName(updated);
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
