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

  @Post()
  create(@CurrentUser() user: User, @Body() body: CreateBookingDto) {
    return this.bookingsService.create(user.id, body);
  }

  @Patch(':id')
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
  @Roles(Role.ROOM_MANAGER, Role.ADMIN)
  approve(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.approve(id, user.id);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(Role.ROOM_MANAGER, Role.ADMIN)
  reject(@CurrentUser() user: User, @Param('id') id: string) {
    return this.bookingsService.reject(id, user.id);
  }
}
