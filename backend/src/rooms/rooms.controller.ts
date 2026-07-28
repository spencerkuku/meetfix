import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { RoomsService } from './rooms.service';
import { parseRoomForm, RoomInput } from './room-form.dto';
import type { RoomFormBody } from './room-form.dto';
import {
  persistRoomPhoto,
  roomPhotoUploadOptions,
  roomPhotoUrl,
} from './room-upload.config';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findAll() {
    return this.roomsService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('photo', roomPhotoUploadOptions))
  async create(
    @Body() body: RoomFormBody,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const input = parseRoomForm(body);
    if (!input.name || !input.location) {
      throw new BadRequestException('name and location are required');
    }
    const filename = photo ? await persistRoomPhoto(photo) : undefined;
    return this.roomsService.create(
      {
        name: input.name,
        location: input.location,
        capacity: input.capacity,
        equipment: input.equipment ?? [],
        requiresApproval: input.requiresApproval ?? false,
      } satisfies RoomInput,
      filename ? roomPhotoUrl(filename) : undefined,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('photo', roomPhotoUploadOptions))
  async update(
    @Param('id') id: string,
    @Body() body: RoomFormBody,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const input = parseRoomForm(body);
    const filename = photo ? await persistRoomPhoto(photo) : undefined;
    return this.roomsService.update(
      id,
      input,
      filename ? roomPhotoUrl(filename) : undefined,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.roomsService.remove(id);
  }
}
