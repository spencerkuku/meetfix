import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Account, Booking, BookingStatus, Room } from '@prisma/client';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../auth/token-encryption.service';
import { isActiveBooking } from '../bookings/booking-status';

// Google Calendar sync for CONFIRMED Bookings, using the refresh token
// captured at Google login time (see AuthService/TokenEncryptionService).
// Every call is best-effort: a Calendar failure must never fail the
// underlying Booking action that triggered it, so all Google API errors are
// caught and logged, never thrown. See README "Google Calendar sync".
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly prisma: PrismaService,
  ) {}

  // Returns the new Calendar event id to persist onto the Booking, or null
  // if no sync happened (not eligible, no refresh token, or the API call
  // failed).
  async syncBookingConfirmed(
    booking: Booking,
    room: Room,
    account: Account,
  ): Promise<string | null> {
    // Eligibility is based on whether the Account has a Google identity linked
    // (googleRefreshToken present), not on how the User originally
    // registered — a password Account can link Google later and becomes
    // eligible immediately.
    if (
      booking.status !== BookingStatus.CONFIRMED ||
      account.googleRefreshToken == null
    ) {
      return null;
    }
    try {
      const calendar = this.calendarClient(account);
      const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: booking.title,
          description: booking.description ?? undefined,
          location: room.name,
          start: { dateTime: booking.startTime.toISOString() },
          end: { dateTime: booking.endTime.toISOString() },
        },
      });
      return event.data.id ?? null;
    } catch (err) {
      this.logger.error(
        `Failed to create Calendar event for Booking ${booking.id}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async removeBookingEvent(booking: Booking, account: Account): Promise<void> {
    if (isActiveBooking(booking.status) || booking.googleEventId === null) {
      return;
    }
    if (!account.googleRefreshToken) {
      return;
    }
    try {
      const calendar = this.calendarClient(account);
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: booking.googleEventId as string,
      });
    } catch (err) {
      this.logger.error(
        `Failed to delete Calendar event for Booking ${booking.id}: ${(err as Error).message}`,
      );
    }
  }

  // `google-auth-library`'s OAuth2Client exchanges the (long-lived) refresh
  // token for a fresh short-lived access token on demand — we never store
  // or handle an access token ourselves. Google only rarely issues a new
  // refresh token on that exchange, but when it does, the old one stops
  // working — so any rotation must be persisted (re-encrypted) immediately
  // or the next sync silently starts failing.
  private calendarClient(account: Account) {
    const oauth2Client = new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
    );
    oauth2Client.setCredentials({
      refresh_token: this.tokenEncryption.decrypt(
        account.googleRefreshToken as string,
      ),
    });
    oauth2Client.on('tokens', (tokens) => {
      if (!tokens.refresh_token) return;
      const encrypted = this.tokenEncryption.encrypt(tokens.refresh_token);
      this.prisma.account
        .update({ where: { id: account.id }, data: { googleRefreshToken: encrypted } })
        .catch((err: Error) =>
          this.logger.error(
            `Failed to persist rotated Google refresh token for Account ${account.id}: ${err.message}`,
          ),
        );
    });
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }
}
