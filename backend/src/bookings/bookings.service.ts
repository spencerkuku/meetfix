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
  Room,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarService } from '../calendar/calendar.service';
import { CreateBookingDto } from './create-booking.dto';
import { UpdateBookingDto } from './update-booking.dto';
import { withUserName } from '../common/with-user-name';
import { ACTIVE_BOOKING_STATUSES, isActiveBooking } from './booking-status';
import { assertOwnerOrAdmin } from '../common/assert-owner-or-admin';

// A Booking's startTime may not be more than this far in the past — small
// enough to tolerate ordinary clock skew between client and server, not to
// permit meaningfully backdated Bookings.
const PAST_START_TOLERANCE_MS = 5 * 60 * 1000;

// The longest a single Booking may span. Without this, an auto-confirmed
// (requiresApproval: false) Booking of arbitrary length permanently occupies
// a Room's slot — see the security audit finding this closes.
const MAX_BOOKING_DURATION_MS = 24 * 60 * 60 * 1000;

export type BookingWithUserName = Booking & { userName: string };

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly calendar: CalendarService,
  ) {}

  // A Booking's Google Calendar sync (issue #11) needs the requester's
  // Account (provider + refresh token), which findAll/create/decide/remove
  // otherwise never fetch — kept to one place rather than repeating the
  // same findUnique across every write path.
  private findAccountFor(userId: string) {
    return this.prisma.account.findUnique({ where: { userId } });
  }

  // Syncs a newly-CONFIRMED Booking to Calendar and persists the resulting
  // event id, mutating `booking` in place so the caller's response reflects
  // it without a second read. Shared by create() (auto-confirmed Bookings)
  // and decide() (an approved Booking) — the only two places a Booking
  // becomes CONFIRMED.
  private async applyCalendarSync(booking: Booking, room: Room): Promise<void> {
    const account = await this.findAccountFor(booking.userId);
    if (!account) return;
    const googleEventId = await this.calendar.syncBookingConfirmed(
      booking,
      room,
      account,
    );
    if (!googleEventId) return;
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { googleEventId },
    });
    booking.googleEventId = googleEventId;
  }

  private async removeCalendarEvent(booking: Booking): Promise<void> {
    const account = await this.findAccountFor(booking.userId);
    if (!account) return;
    await this.calendar.removeBookingEvent(booking, account);
  }

  // Updates an already-synced CONFIRMED Booking's existing Calendar event in
  // place (title/time/location may all have changed) rather than inserting a
  // duplicate. Falls back to inserting a new event if none exists yet (e.g.
  // an earlier sync attempt never succeeded) — same best-effort philosophy
  // as applyCalendarSync/syncBookingConfirmed.
  private async updateCalendarEvent(booking: Booking, room: Room): Promise<void> {
    const account = await this.findAccountFor(booking.userId);
    if (!account) return;
    if (!booking.googleEventId) {
      await this.applyCalendarSync(booking, room);
      return;
    }
    await this.calendar.updateBookingEvent(booking, room, account);
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
          // Slot Conflict: any existing Booking on this Room that overlaps
          // and is still CONFIRMED or PENDING_APPROVAL blocks this request.
          // See CONTEXT.md.
          const conflict = await tx.booking.findFirst({
            where: {
              roomId: dto.roomId,
              status: { in: ACTIVE_BOOKING_STATUSES },
              deletedAt: null,
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          });
          if (conflict) {
            throw new ConflictException(
              'This Room is already booked for an overlapping time range',
            );
          }
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
      if (created.status === BookingStatus.PENDING_APPROVAL) {
        // No Room has a specific assigned manager (see CONTEXT.md's
        // ROOM_MANAGER definition — it's a role, not a per-Room
        // assignment), so every ROOM_MANAGER is notified of every
        // approval-required Booking, not just "their" Room's.
        const roomManagers = await this.prisma.user.findMany({
          where: { role: Role.ROOM_MANAGER },
        });
        await this.notifications.notifyBookingSubmittedForApproval(
          created,
          room,
          roomManagers,
        );
      } else {
        await this.applyCalendarSync(created, room);
      }
      return withUserName(created);
    } catch (err) {
      // Postgres detects the write skew between two concurrent conflict
      // checks under SERIALIZABLE and aborts the loser's transaction.
      // Prisma surfaces that as the documented P2034 ("Transaction failed
      // due to a write conflict or a deadlock") — treat it the same as a
      // Slot Conflict rather than leaking a raw 500. The message-substring
      // check is a fallback in case a given Prisma/Postgres version routes
      // the error through PrismaClientUnknownRequestError instead.
      const isSerializationFailure =
        (err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034') ||
        (err instanceof Prisma.PrismaClientUnknownRequestError &&
          err.message.includes('could not serialize access'));
      if (isSerializationFailure) {
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
      include: { user: true, room: true },
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
    let room = existing.room;
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
      room = newRoom;
      status = newRoom.requiresApproval
        ? BookingStatus.PENDING_APPROVAL
        : BookingStatus.CONFIRMED;
    }

    let updated: Booking & { user: typeof existing.user };
    try {
      updated = await this.prisma.$transaction(
        async (tx) => {
          if (isRescheduling) {
            // Same Slot Conflict rule as create(), excluding this Booking's
            // own current slot.
            const conflict = await tx.booking.findFirst({
              where: {
                id: { not: id },
                roomId,
                status: { in: ACTIVE_BOOKING_STATUSES },
                deletedAt: null,
                startTime: { lt: endTime },
                endTime: { gt: startTime },
              },
            });
            if (conflict) {
              throw new ConflictException(
                'This Room is already booked for an overlapping time range',
              );
            }
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
      const isSerializationFailure =
        (err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2034') ||
        (err instanceof Prisma.PrismaClientUnknownRequestError &&
          err.message.includes('could not serialize access'));
      if (isSerializationFailure) {
        throw new ConflictException(
          'This Room is already booked for an overlapping time range',
        );
      }
      throw err;
    }

    if (previousStatus === BookingStatus.CONFIRMED && status === BookingStatus.PENDING_APPROVAL) {
      await this.removeCalendarEvent(updated);
      const roomManagers = await this.prisma.user.findMany({
        where: { role: Role.ROOM_MANAGER },
      });
      await this.notifications.notifyBookingSubmittedForApproval(
        updated,
        room,
        roomManagers,
      );
    } else if (status === BookingStatus.CONFIRMED) {
      if (previousStatus === BookingStatus.CONFIRMED) {
        await this.updateCalendarEvent(updated, room);
      } else {
        await this.applyCalendarSync(updated, room);
      }
    }

    if (userId !== updated.userId) {
      await this.notifications.notifyBookingEdited(
        updated,
        room,
        updated.user,
        userId,
      );
    }

    return withUserName(updated);
  }

  // Soft-deletes a future Booking regardless of its current status. See
  // CONTEXT.md / issue #19: this makes a Booking the owner no longer wants
  // disappear from all reads, without touching BookingStatus semantics.
  // The sole self-service removal action — cancel() was merged into this.
  async remove(id: string, userId: string, role: Role): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { user: true, room: true },
    });
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
    if (isActiveBooking(booking.status)) {
      await this.removeCalendarEvent(booking);
      await this.notifications.notifyBookingDeleted(
        booking,
        booking.room,
        booking.user,
        userId,
      );
    }
  }

  // Booking Approval: a ROOM_MANAGER (or ADMIN) deciding a PENDING_APPROVAL
  // Booking. See CONTEXT.md — distinct from Account Approval.
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
        // deleted-Booking-resurrection race and the duplicate-approval
        // orphaned-Calendar-event race in one atomic guard, mirroring
        // create()'s existing Serializable-transaction correctness.
        const result = await tx.booking.updateMany({
          where: {
            id,
            status: BookingStatus.PENDING_APPROVAL,
            deletedAt: null,
          },
          data: { status: outcome },
        });
        if (result.count === 0) {
          throw new ConflictException(
            'Only a PENDING_APPROVAL Booking can be approved or rejected',
          );
        }
        return tx.booking.findUniqueOrThrow({
          where: { id },
          include: { user: true, room: true },
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
    await this.notifications.notifyBookingDecision(
      updated,
      updated.room,
      updated.user,
    );
    if (outcome === BookingStatus.CONFIRMED) {
      await this.applyCalendarSync(updated, updated.room);
    } else {
      await this.removeCalendarEvent(updated);
    }
    const { room: _room, ...bookingWithUser } = updated;
    return withUserName(bookingWithUser);
  }
}
