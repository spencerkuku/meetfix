import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account, AccountProvider, AccountStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRoleDto } from './update-role.dto';
import { AddDomainDto } from './add-domain.dto';

function toPendingAccount(
  account: Account & { user: { id: string; email: string; name: string } },
) {
  const { user, ...rest } = account;
  return {
    id: rest.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    createdAt: rest.createdAt,
  };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listPendingAccounts() {
    const accounts = await this.prisma.account.findMany({
      where: { provider: AccountProvider.PASSWORD, status: AccountStatus.PENDING },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(toPendingAccount);
  }

  // Account Approval: distinct from Booking Approval. See CONTEXT.md, ADR-0003.
  async approveAccount(accountId: string, dto: UpdateRoleDto) {
    if (!dto.role) {
      throw new BadRequestException('role is required');
    }
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    if (account.status !== AccountStatus.PENDING) {
      throw new BadRequestException('This Account is not pending approval');
    }

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: accountId },
        data: { status: AccountStatus.ACTIVE },
      }),
      this.prisma.user.update({
        where: { id: account.userId },
        data: { role: dto.role },
      }),
    ]);
  }

  listAutoApprovedDomains() {
    return this.prisma.autoApprovedDomain.findMany({
      orderBy: { domain: 'asc' },
    });
  }

  async addAutoApprovedDomain(dto: AddDomainDto) {
    const domain = dto.domain?.trim().toLowerCase();
    if (!domain) {
      throw new BadRequestException('domain is required');
    }
    try {
      return await this.prisma.autoApprovedDomain.create({
        data: { domain },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('This domain is already on the list');
      }
      throw err;
    }
  }

  async removeAutoApprovedDomain(id: string): Promise<void> {
    const domain = await this.prisma.autoApprovedDomain.findUnique({
      where: { id },
    });
    if (!domain) {
      throw new NotFoundException('Auto-Approved Domain not found');
    }
    await this.prisma.autoApprovedDomain.delete({ where: { id } });
  }

  // Only Users with an ACTIVE Account are listed/editable here — a User
  // whose password Account is still PENDING must go through Account
  // Approval first, not have its Role set through this side door. See
  // ADR-0003, CONTEXT.md.
  listUsers() {
    return this.prisma.user.findMany({
      where: { account: { status: AccountStatus.ACTIVE } },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateUserRole(userId: string, dto: UpdateRoleDto) {
    if (!dto.role) {
      throw new BadRequestException('role is required');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { account: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.account?.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(
        'This User does not have an active Account — use Account Approval instead',
      );
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }
}
