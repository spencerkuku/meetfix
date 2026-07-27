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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';
import type { UpdateRoleDto } from './update-role.dto';
import type { AddDomainDto } from './add-domain.dto';

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
  approveAccount(@Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.adminService.approveAccount(id, body);
  }

  @Get('auto-approved-domains')
  listAutoApprovedDomains() {
    return this.adminService.listAutoApprovedDomains();
  }

  @Post('auto-approved-domains')
  addAutoApprovedDomain(@Body() body: AddDomainDto) {
    return this.adminService.addAutoApprovedDomain(body);
  }

  @Delete('auto-approved-domains/:id')
  @HttpCode(204)
  removeAutoApprovedDomain(@Param('id') id: string) {
    return this.adminService.removeAutoApprovedDomain(id);
  }

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.adminService.updateUserRole(id, body);
  }
}
