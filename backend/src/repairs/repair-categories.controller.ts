import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RepairsService } from './repairs.service';

@Controller('repair-categories')
@UseGuards(JwtAuthGuard)
export class RepairCategoriesController {
  constructor(private readonly repairsService: RepairsService) {}

  @Get()
  findAll() {
    return this.repairsService.findAllCategories();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() body: { name: string }) {
    return this.repairsService.createCategory(body.name);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.repairsService.removeCategory(id);
  }
}
