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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Not bound globally — applied via ThrottlerGuard directly on individual
    // handlers, each of which may override this 'default' limit with its
    // own @Throttle() (see BookingsController, RepairsController). Started
    // out covering only /auth/login and /auth/register (credential
    // stuffing was previously unbounded at every layer); later extended to
    // Booking/Repair Ticket creation for the same reason — see the security
    // audit findings this closes.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    RoomsModule,
    BookingsModule,
    RepairsModule,
    AdminModule,
    AuditModule,
  ],
})
export class AppModule {}
