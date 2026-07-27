import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Booking, BookingStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBookingDto } from './create-booking.dto';

const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.PENDING_APPROVAL,
];

export type BookingWithUserName = Booking & { userName: string };

function withUserName(
  booking: Booking & { user: { name: string } },
): BookingWithUserName {
  const { user, ...rest } = booking;
  return { ...rest, userName: user.name };
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(): Promise<BookingWithUserName[]> {
    const bookings = await this.prisma.booking.findMany({
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
              status: { in: ACTIVE_STATUSES },
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

  async cancel(
    id: string,
    userId: string,
    role: Role,
  ): Promise<BookingWithUserName> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.userId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('You can only cancel your own Bookings');
    }
    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.REJECTED
    ) {
      throw new BadRequestException('This Booking is already inactive');
    }
    if (booking.endTime < new Date()) {
      throw new BadRequestException('Cannot cancel a past Booking');
    }
    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED },
      include: { user: true, room: true },
    });
    await this.notifications.notifyBookingCancelled(
      updated,
      updated.room,
      updated.user,
      userId,
    );
    const { room: _room, ...bookingWithUser } = updated;
    return withUserName(bookingWithUser);
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
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Only a PENDING_APPROVAL Booking can be approved or rejected',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.update({
        where: { id },
        data: { status: outcome },
        include: { user: true, room: true },
      });
      await this.audit.record(
        actorId,
        AuditAction.BOOKING_APPROVAL,
        'Booking',
        id,
        outcome === BookingStatus.CONFIRMED ? 'Approved' : 'Rejected',
        tx,
      );
      return booking;
    });
    await this.notifications.notifyBookingDecision(
      updated,
      updated.room,
      updated.user,
    );
    const { room: _room, ...bookingWithUser } = updated;
    return withUserName(bookingWithUser);
  }
}
