import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Express, Response } from 'express';
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

// `from`/`to` come in as plain YYYY-MM-DD query strings from an HTML date
// input. `endOfDay` pushes the "to" bound to 23:59:59.999 the same day so
// the range is inclusive of that whole day, not just its midnight instant.
function parseDateQueryParam(
  value: string | undefined,
  paramName: string,
  endOfDay: boolean,
): Date | undefined {
  if (!value) return undefined;
  const date = new Date(
    `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`,
  );
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${paramName} date`);
  }
  return date;
}

@Controller('repairs')
@UseGuards(JwtAuthGuard)
export class RepairsController {
  constructor(private readonly repairsService: RepairsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.repairsService.findAll(user.id, user.role);
  }

  // FACILITY_MANAGER/ADMIN-only bulk export. No other GET route shares this
  // path, so there's no route-ordering ambiguity with findAll() above.
  @Get('export')
  @UseGuards(RolesGuard)
  @Roles(Role.FACILITY_MANAGER, Role.ADMIN)
  async exportCsv(
    @CurrentUser() user: User,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const fromDate = parseDateQueryParam(from, 'from', false);
    const toDate = parseDateQueryParam(to, 'to', true);
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must not be after to');
    }

    const { csv } = await this.repairsService.exportCsv(
      user.id,
      user.role,
      fromDate,
      toDate,
    );

    const today = new Date().toISOString().slice(0, 10);
    const rangeLabel = from && to ? `${from}_${to}` : '全部';
    const filename = `報修單_${rangeLabel}_${today}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(csv);
  }

  // Rate limited: unthrottled, this endpoint let any USER script an
  // unbounded flood of photo-attached submissions into the shared uploads
  // volume. Looser than the auth endpoints' 5/60s, since ordinary ticket
  // submission is legitimately more frequent than login attempts. See the
  // security audit finding this closes.
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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
        userClass: body.userClass ?? '',
        userPhone: body.userPhone ?? '',
      },
      filename ? repairPhotoUrl(filename) : undefined,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.FACILITY_MANAGER, Role.ADMIN)
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateRepairTicketDto,
  ) {
    return this.repairsService.updateStatus(user.id, id, body);
  }

  // Reporter-side content edit — deliberately a distinct route from the
  // FACILITY_MANAGER/ADMIN-only PATCH :id above, since the permission model
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
