import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Booking, BookingStatus, RepairTicket, Room, User } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';

// Transactional email on booking/repair domain events. SMTP is optional —
// with no SMTP_HOST configured, `send` no-ops (logged, not thrown), so the
// app runs fully without email in dev/test. See README "Email notifications".
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly transporter?: Transporter;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    this.fromAddress =
      this.config.get<string>('SMTP_FROM') || 'meetfix@localhost';
    if (host) {
      this.transporter = createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT')) || 587,
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: this.config.get<string>('SMTP_USER')
          ? {
              user: this.config.get<string>('SMTP_USER'),
              pass: this.config.get<string>('SMTP_PASS'),
            }
          : undefined,
      });
    }
  }

  async notifyBookingSubmittedForApproval(
    booking: Booking,
    room: Room,
    roomManagers: User[],
  ): Promise<void> {
    if (booking.status !== BookingStatus.PENDING_APPROVAL) return;
    await Promise.all(
      roomManagers.map((manager) =>
        this.send(
          manager.email,
          `新的預約待審核：${room.name}`,
          `${room.name} 有一筆新的預約申請「${booking.title}」正在等候您審核。`,
        ),
      ),
    );
  }

  async notifyBookingDecision(
    booking: Booking,
    room: Room,
    requester: User,
  ): Promise<void> {
    const outcome = booking.status === 'CONFIRMED' ? '已核准' : '已拒絕';
    await this.send(
      requester.email,
      `您的預約「${booking.title}」${outcome}`,
      `您在 ${room.name} 的預約「${booking.title}」${outcome}。`,
    );
  }

  async notifyBookingDeleted(
    booking: Booking,
    room: Room,
    requester: User,
    deletedByUserId: string,
  ): Promise<void> {
    if (deletedByUserId === booking.userId) return;
    await this.send(
      requester.email,
      `您的預約「${booking.title}」已被刪除`,
      `您在 ${room.name} 的預約「${booking.title}」已被刪除。`,
    );
  }

  async notifyRepairUpdate(
    ticket: RepairTicket,
    reporter: User,
    updates: { status?: unknown; adminReply?: unknown },
  ): Promise<void> {
    if (updates.status === undefined && updates.adminReply === undefined) {
      return;
    }
    await this.send(
      reporter.email,
      `您的報修單狀態更新：${ticket.location}`,
      `您在「${ticket.location}」的報修單狀態或回覆已更新，請登入系統查看詳情。`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(`SMTP not configured — skipped email to ${to}: ${subject}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.fromAddress, to, subject, text });
    } catch (err) {
      // A notification failure must never fail the underlying booking/repair
      // action that triggered it.
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }
}
