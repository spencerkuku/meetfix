import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BookingsService } from './bookings.service';
import type { CreateBookingDto } from './create-booking.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateBookingDto) {
    return this.bookingsService.create(user.id, body);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.cancel(id, user.id, user.role);
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.ROOM_MANAGER, Role.ADMIN)
  approve(@Param('id') id: string) {
    return this.bookingsService.approve(id);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ROOM_MANAGER, Role.ADMIN)
  reject(@Param('id') id: string) {
    return this.bookingsService.reject(id);
  }
}
