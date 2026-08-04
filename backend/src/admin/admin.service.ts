import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Account,
  AccountProvider,
  AccountStatus,
  AuditAction,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, AuditEntry } from '../audit/audit.service';
import { UpdateRoleDto } from './update-role.dto';
import { UpdateStatusDto } from './update-status.dto';
import { AddDomainDto } from './add-domain.dto';
import { UpdateDomainDto } from './update-domain.dto';
import { isSerializationFailure } from '../common/is-serialization-failure';
import { SERIALIZABLE_TX_OPTIONS } from '../common/serializable-tx-options';

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

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  createdAt: true,
  account: {
    select: { status: true, googleSub: true, passwordHash: true },
  },
  _count: { select: { bookings: true, repairTickets: true } },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_SELECT }>;

// Reports every currently-linked login method (a User may have both, via
// Google account linking — see ADR-0003) rather than just the original
// signup provider, so the list reflects what actually works today.
function toAdminUser(user: AdminUserRow) {
  const { account, _count, ...rest } = user;
  return {
    ...rest,
    accountStatus: account?.status ?? AccountStatus.ACTIVE,
    googleLinked: account?.googleSub != null,
    hasPassword: account?.passwordHash != null,
    bookingCount: _count.bookings,
    repairTicketCount: _count.repairTickets,
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPendingAccounts() {
    const accounts = await this.prisma.account.findMany({
      where: {
        provider: AccountProvider.PASSWORD,
        status: AccountStatus.PENDING,
      },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(toPendingAccount);
  }

  // Account Approval: distinct from Booking Approval. See CONTEXT.md, ADR-0003.
  async approveAccount(actorId: string, accountId: string, dto: UpdateRoleDto) {
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

    await this.audit.runAuditedTransaction(
      async (tx) => {
        await tx.account.update({
          where: { id: accountId },
          data: { status: AccountStatus.ACTIVE },
        });
        await tx.user.update({
          where: { id: account.userId },
          data: { role: dto.role },
        });
      },
      {
        actorId,
        action: AuditAction.ACCOUNT_APPROVAL,
        targetType: 'Account',
        targetId: accountId,
        detail: `Approved with Role ${dto.role}`,
      },
    );
  }

  listAutoApprovedDomains() {
    return this.prisma.autoApprovedDomain.findMany({
      orderBy: { domain: 'asc' },
    });
  }

  async addAutoApprovedDomain(actorId: string, dto: AddDomainDto) {
    const domain = dto.domain?.trim().toLowerCase();
    if (!domain) {
      throw new BadRequestException('domain is required');
    }
    const allowSubdomains = dto.allowSubdomains ?? false;
    try {
      return await this.audit.runAuditedTransaction(
        (tx) => tx.autoApprovedDomain.create({ data: { domain, allowSubdomains } }),
        (created) => ({
          actorId,
          action: AuditAction.AUTO_APPROVED_DOMAIN_CHANGE,
          targetType: 'AutoApprovedDomain',
          targetId: created.id,
          detail: `Added domain ${domain} (allowSubdomains=${allowSubdomains})`,
        }),
      );
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

  async updateAutoApprovedDomain(
    actorId: string,
    id: string,
    dto: UpdateDomainDto,
  ) {
    if (typeof dto.allowSubdomains !== 'boolean') {
      throw new BadRequestException('allowSubdomains must be a boolean');
    }
    const existing = await this.prisma.autoApprovedDomain.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Auto-Approved Domain not found');
    }
    const changed = existing.allowSubdomains !== dto.allowSubdomains;
    return this.audit.runAuditedTransaction(
      (tx) =>
        tx.autoApprovedDomain.update({
          where: { id },
          data: { allowSubdomains: dto.allowSubdomains },
        }),
      changed
        ? {
            actorId,
            action: AuditAction.AUTO_APPROVED_DOMAIN_CHANGE,
            targetType: 'AutoApprovedDomain',
            targetId: id,
            detail: `Set allowSubdomains=${dto.allowSubdomains} for domain ${existing.domain}`,
          }
        : null,
    );
  }

  async removeAutoApprovedDomain(actorId: string, id: string): Promise<void> {
    const domain = await this.prisma.autoApprovedDomain.findUnique({
      where: { id },
    });
    if (!domain) {
      throw new NotFoundException('Auto-Approved Domain not found');
    }
    await this.audit.runAuditedTransaction(
      (tx) => tx.autoApprovedDomain.delete({ where: { id } }),
      {
        actorId,
        action: AuditAction.AUTO_APPROVED_DOMAIN_CHANGE,
        targetType: 'AutoApprovedDomain',
        targetId: id,
        detail: `Removed domain ${domain.domain}`,
      },
    );
  }

  // Only Users with an ACTIVE or SUSPENDED Account are listed/editable here
  // — a User whose password Account is still PENDING must go through
  // Account Approval first, not have its Role set through this side door.
  // See ADR-0003, CONTEXT.md.
  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        account: {
          status: { in: [AccountStatus.ACTIVE, AccountStatus.SUSPENDED] },
        },
      },
      select: ADMIN_USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toAdminUser);
  }

  private async findAdminUser(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: ADMIN_USER_SELECT,
    });
    return toAdminUser(user);
  }

  // Shared by Role Change, Suspension, and Deletion — none of them may
  // leave the system with zero remaining Admins. See CONTEXT.md.
  //
  // Two things make this safe against two Admins racing to act on each
  // other concurrently (the security audit finding this closes):
  //
  // 1. It must run inside the SAME Serializable transaction as the write it
  //    guards (via `tx`, not `this.prisma`) — a standalone read-then-later-
  //    write lets two concurrent requests each observe the pre-mutation
  //    count and both pass.
  // 2. The count must require `account.status: ACTIVE`, not just
  //    `role: ADMIN`. Suspension only changes Account.status, never
  //    User.role — if this count ignored status, two Admins suspending
  //    each other would touch disjoint columns (each write hits the OTHER
  //    party's Account row, each read only inspects its OWN), so Postgres
  //    would see no overlapping read/write and never detect the conflict.
  //    Requiring ACTIVE makes each transaction's count read the very
  //    Account row the other transaction is about to write, which is what
  //    lets Postgres's Serializable isolation catch the race and abort one
  //    side.
  private async assertNotLastAdminTx(
    tx: Prisma.TransactionClient,
    userId: string,
    verb: string,
  ) {
    const remainingAdmins = await tx.user.count({
      where: {
        role: Role.ADMIN,
        id: { not: userId },
        account: { status: AccountStatus.ACTIVE },
      },
    });
    if (remainingAdmins === 0) {
      throw new BadRequestException(`Cannot ${verb} the last remaining Admin`);
    }
  }

  async updateUserRole(actorId: string, userId: string, dto: UpdateRoleDto) {
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
    const isRemovingAdmin = user.role === Role.ADMIN && dto.role !== Role.ADMIN;
    await this.runAdminGuardedTransaction(
      isRemovingAdmin,
      'remove',
      async (tx) => {
        if (isRemovingAdmin) {
          await this.assertNotLastAdminTx(tx, userId, 'remove');
        }
        return tx.user.update({
          where: { id: userId },
          data: { role: dto.role },
        });
      },
      {
        actorId,
        action: AuditAction.ROLE_CHANGE,
        targetType: 'User',
        targetId: userId,
        detail: `Role changed from ${user.role} to ${dto.role}`,
      },
    );
    return this.findAdminUser(userId);
  }

  // Suspension: a reversible, Admin-driven block on login that leaves the
  // User's existing Bookings/Repair Tickets untouched. Distinct from
  // Account Approval's PENDING — suspending only ever applies to an
  // already-ACTIVE or already-SUSPENDED Account. See CONTEXT.md.
  async updateUserStatus(actorId: string, userId: string, dto: UpdateStatusDto) {
    if (dto.status !== AccountStatus.ACTIVE && dto.status !== AccountStatus.SUSPENDED) {
      throw new BadRequestException('status must be ACTIVE or SUSPENDED');
    }
    if (actorId === userId) {
      throw new BadRequestException('Cannot change your own Account Status');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { account: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const previousStatus = user.account?.status;
    if (
      previousStatus !== AccountStatus.ACTIVE &&
      previousStatus !== AccountStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'This User does not have an active Account — use Account Approval instead',
      );
    }
    const isSuspendingAdmin =
      dto.status === AccountStatus.SUSPENDED && user.role === Role.ADMIN;

    await this.runAdminGuardedTransaction(
      isSuspendingAdmin,
      'suspend',
      async (tx) => {
        if (isSuspendingAdmin) {
          await this.assertNotLastAdminTx(tx, userId, 'suspend');
        }
        return tx.account.update({
          where: { userId },
          data: { status: dto.status },
        });
      },
      {
        actorId,
        action:
          dto.status === AccountStatus.SUSPENDED
            ? AuditAction.ACCOUNT_SUSPENSION
            : AuditAction.ACCOUNT_REACTIVATION,
        targetType: 'User',
        targetId: userId,
        detail: `Account Status changed from ${previousStatus} to ${dto.status}`,
      },
    );
    return this.findAdminUser(userId);
  }

  // User Deletion: a true hard delete, distinct from Booking Deletion /
  // Repair Ticket Deletion (which are soft, `deletedAt`-based, and scoped
  // to the owner's own future/pending items). Deleting the User cascades
  // to remove all of their Bookings and Repair Tickets outright. Audit Log
  // Entries where this User was the actor are kept — `actorId` is nulled
  // (FK onDelete: SetNull) and `actorName` is snapshotted first so history
  // still reads correctly. See CONTEXT.md.
  async deleteUser(actorId: string, userId: string) {
    if (actorId === userId) {
      throw new BadRequestException('Cannot delete your own Account');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const isDeletingAdmin = user.role === Role.ADMIN;

    await this.runAdminGuardedTransaction(
      isDeletingAdmin,
      'delete',
      async (tx) => {
        if (isDeletingAdmin) {
          await this.assertNotLastAdminTx(tx, userId, 'delete');
        }
        await tx.auditLogEntry.updateMany({
          where: { actorId: userId },
          data: { actorName: user.name },
        });
        const { count: bookingCount } = await tx.booking.deleteMany({
          where: { userId },
        });
        const { count: repairTicketCount } = await tx.repairTicket.deleteMany(
          { where: { userId } },
        );
        await tx.account.deleteMany({ where: { userId } });
        await tx.user.delete({ where: { id: userId } });
        return { bookingCount, repairTicketCount };
      },
      (result) => ({
        actorId,
        action: AuditAction.USER_DELETION,
        targetType: 'User',
        targetId: userId,
        detail: `Deleted User ${user.name} <${user.email}> (cascaded ${result.bookingCount} Booking(s), ${result.repairTicketCount} Repair Ticket(s))`,
      }),
    );
  }

  // Shared by updateUserRole/updateUserStatus/deleteUser: runs `mutate`
  // audited exactly like AuditService.runAuditedTransaction, but when
  // `guarded` is true also requests Serializable isolation and translates
  // the resulting write-skew conflict (two Admins racing to act on each
  // other — see assertNotLastAdminTx) into the same
  // "Cannot <verb> the last remaining Admin" error the guard itself throws,
  // rather than leaking a raw transaction-conflict error.
  private async runAdminGuardedTransaction<T>(
    guarded: boolean,
    verb: string,
    mutate: (tx: Prisma.TransactionClient) => Promise<T>,
    auditEntry: AuditEntry | null | ((result: T) => AuditEntry | null),
  ): Promise<T> {
    try {
      return await this.audit.runAuditedTransaction(
        mutate,
        auditEntry,
        guarded ? SERIALIZABLE_TX_OPTIONS : undefined,
      );
    } catch (err) {
      if (guarded && isSerializationFailure(err)) {
        throw new BadRequestException(
          `Cannot ${verb} the last remaining Admin`,
        );
      }
      throw err;
    }
  }
}
