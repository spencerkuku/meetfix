import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
}
