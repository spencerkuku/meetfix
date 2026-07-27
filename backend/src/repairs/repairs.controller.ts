import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RepairsService } from './repairs.service';
import type { RepairTicketFormBody } from './repair-ticket-form.dto';
import type { UpdateRepairTicketDto } from './update-repair-ticket.dto';
import {
  persistRepairPhoto,
  repairPhotoUploadOptions,
  repairPhotoUrl,
} from './repair-upload.config';

@Controller('repairs')
@UseGuards(JwtAuthGuard)
export class RepairsController {
  constructor(private readonly repairsService: RepairsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.repairsService.findAll(user.id, user.role);
  }

  @Post()
  @UseInterceptors(FileInterceptor('photo', repairPhotoUploadOptions))
  async create(
    @CurrentUser() user: User,
    @Body() body: RepairTicketFormBody,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const filename = photo ? await persistRepairPhoto(photo) : undefined;
    return this.repairsService.create(
      user.id,
      {
        roomId: body.roomId,
        location: body.location ?? '',
        category: body.category ?? '',
        description: body.description ?? '',
        userClass: body.userClass,
        userPhone: body.userPhone,
      },
      filename ? repairPhotoUrl(filename) : undefined,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.MAINTENANCE, Role.ADMIN)
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateRepairTicketDto,
  ) {
    return this.repairsService.updateStatus(user.id, id, body);
  }
}
