import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { AdminService } from './admin.service';
import type { UpdateRoleDto } from './update-role.dto';
import type { AddDomainDto } from './add-domain.dto';
import type { UpdateDomainDto } from './update-domain.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('pending-accounts')
  listPendingAccounts() {
    return this.adminService.listPendingAccounts();
  }

  @Patch('accounts/:id/approve')
  approveAccount(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.adminService.approveAccount(actor.id, id, body);
  }

  @Get('auto-approved-domains')
  listAutoApprovedDomains() {
    return this.adminService.listAutoApprovedDomains();
  }

  @Post('auto-approved-domains')
  addAutoApprovedDomain(
    @CurrentUser() actor: User,
    @Body() body: AddDomainDto,
  ) {
    return this.adminService.addAutoApprovedDomain(actor.id, body);
  }

  @Patch('auto-approved-domains/:id')
  updateAutoApprovedDomain(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() body: UpdateDomainDto,
  ) {
    return this.adminService.updateAutoApprovedDomain(actor.id, id, body);
  }

  @Delete('auto-approved-domains/:id')
  @HttpCode(204)
  removeAutoApprovedDomain(@CurrentUser() actor: User, @Param('id') id: string) {
    return this.adminService.removeAutoApprovedDomain(actor.id, id);
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Patch('users/:id/role')
  updateUserRole(
    @CurrentUser() actor: User,
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.adminService.updateUserRole(actor.id, id, body);
  }
}
