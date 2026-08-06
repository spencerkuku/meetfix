import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  Booking,
  BookingStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateBookingDto } from './create-booking.dto';
import { UpdateBookingDto } from './update-booking.dto';
import { withUserName } from '../common/with-user-name';
import { ACTIVE_BOOKING_STATUSES, isActiveBooking } from './booking-status';
import { assertOwnerOrAdmin } from '../common/assert-owner-or-admin';
import { isSerializationFailure } from '../common/is-serialization-failure';

// A Booking's startTime may not be more than this far in the past — small
// enough to tolerate ordinary clock skew between client and server, not to
// permit meaningfully backdated Bookings.
const PAST_START_TOLERANCE_MS = 5 * 60 * 1000;

// The longest a single Booking may span. Without this, an auto-confirmed
// (requiresApproval: false) Booking of arbitrary length permanently occupies
// a Room's slot — see the security audit finding this closes.
const MAX_BOOKING_DURATION_MS = 24 * 60 * 60 * 1000;

// The most active (CONFIRMED/PENDING_APPROVAL, not-yet-ended) Bookings a
// single User may hold at once. Complements the creation-endpoint rate
// limit (BookingsController) — that bounds *speed*, this bounds *total
// simultaneous holdings*, so a sufficiently patient script staying under
// the rate limit still can't accumulate unlimited future Room slots. See
// the security audit finding this closes.
const MAX_ACTIVE_BOOKINGS_PER_USER = 200;

export type BookingWithUserName = Booking & { userName: string };

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Shared by create() and update()'s reschedule path — both add a new
  // active Room-slot claim for `userId` and must not push them over the
  // cap. `excludeBookingId` lets update() exclude the very Booking being
  // rescheduled from its own count.
  private async assertUnderActiveBookingCap(
    tx: Prisma.TransactionClient,
    userId: string,
    excludeBookingId?: string,
  ) {
    const activeCount = await tx.booking.count({
      where: {
        userId,
        deletedAt: null,
        status: { in: ACTIVE_BOOKING_STATUSES },
        endTime: { gt: new Date() },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
    });
    if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_USER) {
      throw new BadRequestException(
        `You already have ${MAX_ACTIVE_BOOKINGS_PER_USER} active Bookings — cancel or wait for one to end before creating another`,
      );
    }
  }

  // Slot Conflict: shared by create(), update()'s reschedule path, and
  // revert() — any existing Booking on this Room that overlaps and is
  // still CONFIRMED or PENDING_APPROVAL blocks the request. See CONTEXT.md.
  // `excludeBookingId` lets update()/revert() exclude the Booking's own
  // current row from the check.
  private async assertNoSlotConflict(
    tx: Prisma.TransactionClient,
    roomId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
  ) {
    const conflict = await tx.booking.findFirst({
      where: {
        roomId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        deletedAt: null,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
    });
    if (conflict) {
      throw new ConflictException(
        'This Room is already booked for an overlapping time range',
      );
    }
  }

  findApprovalHistory() {
    return this.audit.findBookingHistory();
  }

  async findAll(): Promise<BookingWithUserName[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { deletedAt: null },
      orderBy: { startTime: 'asc' },
      include: { user: { select: { name: true } } },
    });
    return bookings.map(withUserName);
  }

  async create(
    userId: string,
    dto: CreateBookingDto,
  ): Promise<BookingWithUserName> {
    if (!dto.roomId || !dto.title || !dto.startTime || !dto.endTime) {
      throw new BadRequestException(
        'roomId, title, startTime and endTime are required',
      );
    }
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      startTime >= endTime
    ) {
      throw new BadRequestException(
        'endTime must be a valid date after startTime',
      );
    }
    if (startTime.getTime() < Date.now() - PAST_START_TOLERANCE_MS) {
      throw new BadRequestException('startTime cannot be in the past');
    }
    if (endTime.getTime() - startTime.getTime() > MAX_BOOKING_DURATION_MS) {
      throw new BadRequestException('A Booking cannot span more than 24 hours');
    }

    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    const status = room.requiresApproval
      ? BookingStatus.PENDING_APPROVAL
      : BookingStatus.CONFIRMED;

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          await this.assertUnderActiveBookingCap(tx, userId);
          await this.assertNoSlotConflict(tx, dto.roomId, startTime, endTime);
          return tx.booking.create({
            data: {
              roomId: dto.roomId,
              userId,
              title: dto.title,
              description: dto.description,
              startTime,
              endTime,
              status,
            },
            include: { user: { select: { name: true } } },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return withUserName(created);
    } catch (err) {
      // Postgres detects the write skew between two concurrent conflict
      // checks under SERIALIZABLE and aborts the loser's transaction —
      // treat it the same as a Slot Conflict rather than leaking a raw 500.
      if (isSerializationFailure(err)) {
        throw new ConflictException(
          'This Room is already booked for an overlapping time range',
        );
      }
      throw err;
    }
  }

  // Edits a future, still-active (CONFIRMED/PENDING_APPROVAL) Booking's
  // content and/or slot. Content-only edits (title/description) never touch
  // status; a roomId/startTime/endTime change re-validates the slot exactly
  // like create() and recomputes status from the (possibly new) Room's
  // requiresApproval, regardless of the previous status — mirroring create()
  // rather than introducing a parallel set of rules.
  async update(
    id: string,
    userId: string,
    role: Role,
    dto: UpdateBookingDto,
  ): Promise<BookingWithUserName> {
    const existing = await this.prisma.booking.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Booking not found');
    }
    assertOwnerOrAdmin(existing, userId, role, 'You can only edit your own Bookings');
    if (!isActiveBooking(existing.status)) {
      throw new BadRequestException(
        'Only a CONFIRMED or PENDING_APPROVAL Booking can be edited',
      );
    }
    if (existing.startTime < new Date()) {
      throw new BadRequestException(
        'Cannot edit a past or in-progress Booking',
      );
    }

    const isRescheduling =
      dto.roomId !== undefined ||
      dto.startTime !== undefined ||
      dto.endTime !== undefined;

    const startTime = dto.startTime ? new Date(dto.startTime) : existing.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : existing.endTime;
    const roomId = dto.roomId ?? existing.roomId;
    const previousStatus = existing.status;
    let status = existing.status;

    if (isRescheduling) {
      if (
        Number.isNaN(startTime.getTime()) ||
        Number.isNaN(endTime.getTime()) ||
        startTime >= endTime
      ) {
        throw new BadRequestException(
          'endTime must be a valid date after startTime',
        );
      }
      if (startTime.getTime() < Date.now() - PAST_START_TOLERANCE_MS) {
        throw new BadRequestException('startTime cannot be in the past');
      }
      if (endTime.getTime() - startTime.getTime() > MAX_BOOKING_DURATION_MS) {
        throw new BadRequestException(
          'A Booking cannot span more than 24 hours',
        );
      }
      const newRoom = await this.prisma.room.findUnique({
        where: { id: roomId },
      });
      if (!newRoom) {
        throw new NotFoundException('Room not found');
      }
      status = newRoom.requiresApproval
        ? BookingStatus.PENDING_APPROVAL
        : BookingStatus.CONFIRMED;
    }

    let updated: Booking & { user: typeof existing.user };
    try {
      updated = await this.prisma.$transaction(
        async (tx) => {
          if (isRescheduling) {
            // Same active-Booking cap as create(), excluding this Booking's
            // own row — a reschedule doesn't add a new active claim, so
            // this only ever matters if a concurrent request changed the
            // caller's count between our initial read and here.
            await this.assertUnderActiveBookingCap(tx, userId, id);
            await this.assertNoSlotConflict(tx, roomId, startTime, endTime, id);
          }
          // Conditional on the status we read (not just id), same guard
          // decide()/remove() already use — closes the race where a
          // concurrent approve/reject/delete changes the Booking between
          // our initial read above and this write.
          const result = await tx.booking.updateMany({
            where: { id, status: previousStatus, deletedAt: null },
            data: {
              ...(dto.title !== undefined ? { title: dto.title } : {}),
              ...(dto.description !== undefined
                ? { description: dto.description }
                : {}),
              ...(isRescheduling ? { roomId, startTime, endTime, status } : {}),
            },
          });
          if (result.count === 0) {
            throw new ConflictException(
              'This Booking was changed concurrently — please retry',
            );
          }
          return tx.booking.findUniqueOrThrow({
            where: { id },
            include: { user: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (isSerializationFailure(err)) {
        throw new ConflictException(
          'This Room is already booked for an overlapping time range',
        );
      }
      throw err;
    }

    return withUserName(updated);
  }

  // Soft-deletes a future Booking regardless of its current status. See
  // CONTEXT.md / issue #19: this makes a Booking the owner no longer wants
  // disappear from all reads, without touching BookingStatus semantics.
  // The sole self-service removal action — cancel() was merged into this.
  async remove(id: string, userId: string, role: Role): Promise<void> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking || booking.deletedAt) {
      throw new NotFoundException('Booking not found');
    }
    assertOwnerOrAdmin(
      booking,
      userId,
      role,
      'You can only delete your own Bookings',
    );
    if (booking.startTime < new Date()) {
      throw new BadRequestException(
        'Cannot delete a past or in-progress Booking',
      );
    }
    const result = await this.prisma.booking.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ConflictException('This Booking was already deleted');
    }
  }

  // Booking Approval: a FACILITY_MANAGER (or ADMIN) deciding a
  // PENDING_APPROVAL Booking. See CONTEXT.md — distinct from Account
  // Approval.
  async approve(id: string, actorId: string): Promise<BookingWithUserName> {
    return this.decide(id, actorId, BookingStatus.CONFIRMED);
  }

  async reject(id: string, actorId: string): Promise<BookingWithUserName> {
    return this.decide(id, actorId, BookingStatus.REJECTED);
  }

  private async decide(
    id: string,
    actorId: string,
    outcome: typeof BookingStatus.CONFIRMED | typeof BookingStatus.REJECTED,
  ): Promise<BookingWithUserName> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking || booking.deletedAt) {
      throw new NotFoundException('Booking not found');
    }
    const updated = await this.audit.runAuditedTransaction(
      async (tx) => {
        // Conditional on status and deletedAt, not just id, so two racing
        // decide() calls (or a decide() racing a concurrent remove()) can't
        // both proceed — only the first to commit wins, closing both the
        // deleted-Booking-resurrection race and the duplicate-approval race
        // in one atomic guard, mirroring create()'s existing
        // Serializable-transaction correctness.
        const result = await tx.booking.updateMany({
          where: {
            id,
            status: BookingStatus.PENDING_APPROVAL,
            deletedAt: null,
          },
          data: {
            status: outcome,
            reviewedAt: new Date(),
            reviewedById: actorId,
          },
        });
        if (result.count === 0) {
          throw new ConflictException(
            'Only a PENDING_APPROVAL Booking can be approved or rejected',
          );
        }
        return tx.booking.findUniqueOrThrow({
          where: { id },
          include: { user: true },
        });
      },
      {
        actorId,
        action: AuditAction.BOOKING_APPROVAL,
        targetType: 'Booking',
        targetId: id,
        detail: outcome === BookingStatus.CONFIRMED ? 'Approved' : 'Rejected',
      },
    );
    return withUserName(updated);
  }

  // Booking Revert: undoes a decide() outcome, sending a reviewed
  // CONFIRMED/REJECTED Booking back to PENDING_APPROVAL for re-decision.
  // Eligibility is gated on `reviewedAt` (not status/Room state) — that's
  // the only way to tell a reviewed CONFIRMED apart from one that was
  // auto-CONFIRMED because its Room never required approval, since
  // Room.requiresApproval may have changed since the decision was made.
  async revert(id: string, actorId: string): Promise<BookingWithUserName> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking || booking.deletedAt) {
      throw new NotFoundException('Booking not found');
    }
    try {
      const { booking: updated } = await this.audit.runAuditedTransaction(
        async (tx) => {
          const current = await tx.booking.findUniqueOrThrow({
            where: { id },
          });
          if (
            current.deletedAt ||
            current.reviewedAt === null ||
            (current.status !== BookingStatus.CONFIRMED &&
              current.status !== BookingStatus.REJECTED)
          ) {
            throw new ConflictException(
              'Only a reviewed CONFIRMED or REJECTED Booking can be reverted',
            );
          }
          const previousStatus = current.status;
          // REJECTED isn't in ACTIVE_BOOKING_STATUSES, so it doesn't hold
          // the Room's slot — someone else may have booked it since. Re-run
          // the same Slot Conflict check create() uses before reviving it
          // as PENDING_APPROVAL, which does hold the slot.
          if (previousStatus === BookingStatus.REJECTED) {
            await this.assertNoSlotConflict(
              tx,
              current.roomId,
              current.startTime,
              current.endTime,
              id,
            );
          }
          const result = await tx.booking.updateMany({
            where: { id, status: previousStatus, deletedAt: null },
            data: {
              status: BookingStatus.PENDING_APPROVAL,
              reviewedAt: null,
              reviewedById: null,
            },
          });
          if (result.count === 0) {
            throw new ConflictException(
              'This Booking was changed concurrently — please retry',
            );
          }
          return {
            booking: await tx.booking.findUniqueOrThrow({
              where: { id },
              include: { user: true },
            }),
            previousStatus,
          };
        },
        ({ previousStatus }) => ({
          actorId,
          action: AuditAction.BOOKING_REVERT,
          targetType: 'Booking',
          targetId: id,
          detail: `Reverted from ${previousStatus}`,
        }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return withUserName(updated);
    } catch (err) {
      if (isSerializationFailure(err)) {
        throw new ConflictException(
          'This Room is already booked for an overlapping time range',
        );
      }
      throw err;
    }
  }
}
