import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BookingsService } from './bookings.service';
import type { CreateBookingDto } from './create-booking.dto';
import type { UpdateBookingDto } from './update-booking.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }

  @Get('approval-history')
  @UseGuards(RolesGuard)
  @Roles(Role.FACILITY_MANAGER, Role.ADMIN)
  approvalHistory() {
    return this.bookingsService.findApprovalHistory();
  }

  // Rate limited: room availability is a shared, contended resource — an
  // unthrottled create() let any USER script permanent room-slot
  // monopolization. Looser than the auth endpoints' 5/60s, since ordinary
  // Booking creation is legitimately more frequent than login attempts;
  // BookingsService.create's own active-Booking cap is the complementary
  // guard against a *patient* script staying under this limit. See the
  // security audit finding this closes.
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  create(@CurrentUser() user: User, @Body() body: CreateBookingDto) {
    return this.bookingsService.create(user.id, body);
  }

  // Rate limited for the same reason as create() above — a reschedule
  // (roomId/startTime/endTime change) re-runs the same Slot Conflict check
  // and could otherwise be used to the same monopolizing effect.
  @Patch(':id')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateBookingDto,
  ) {
    return this.bookingsService.update(id, user.id, user.role, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.remove(id, user.id, user.role);
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.FACILITY_MANAGER, Role.ADMIN)
  approve(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.approve(id, user.id);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.FACILITY_MANAGER, Role.ADMIN)
  reject(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.reject(id, user.id);
  }

  @Patch(':id/revert')
  @UseGuards(RolesGuard)
  @Roles(Role.FACILITY_MANAGER, Role.ADMIN)
  revert(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.revert(id, user.id);
  }
}
