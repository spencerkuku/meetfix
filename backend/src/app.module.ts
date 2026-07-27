import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { BookingsModule } from './bookings/bookings.module';
import { RepairsModule } from './repairs/repairs.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CalendarModule } from './calendar/calendar.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limit for /auth/login and /auth/register only (applied via
    // ThrottlerGuard directly on those handlers, not globally) — see the
    // security audit finding this closes: those endpoints previously had no
    // throttling at any layer, making credential stuffing unbounded.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    RoomsModule,
    BookingsModule,
    RepairsModule,
    AdminModule,
    AuditModule,
    NotificationsModule,
    CalendarModule,
  ],
})
export class AppModule {}
