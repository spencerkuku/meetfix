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
import type { UpdateRepairTicketContentFormBody } from './update-repair-ticket-content.dto';
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

  // Reporter-side content edit — deliberately a distinct route from the
  // MAINTENANCE/ADMIN-only PATCH :id above, since the permission model
  // (owner-or-admin, not role-gated) and payload shape are both different.
  @Patch(':id/content')
  @UseInterceptors(FileInterceptor('photo', repairPhotoUploadOptions))
  async updateContent(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateRepairTicketContentFormBody,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    const filename = photo ? await persistRepairPhoto(photo) : undefined;
    return this.repairsService.updateContent(
      user.id,
      user.role,
      id,
      {
        location: body.location,
        category: body.category,
        description: body.description,
        removePhoto: body.removePhoto === 'true',
      },
      filename ? repairPhotoUrl(filename) : undefined,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.repairsService.remove(user.id, user.role, id);
  }
}
