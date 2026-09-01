import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { AdminService } from './../src/admin/admin.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { Role } from '@prisma/client';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';
import { permissiveThrottlerGuard } from './support/permissive-throttler-guard';

describe('Admin (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let adminService: AdminService;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;

  async function tokenFor(email: string, role: Role): Promise<string> {
    const { user } = await authService.loginWithGoogle({
      googleSub: `sub-${email}`,
      email,
      name: email,
      hostedDomain: 'school.edu.tw',
    });
    if (role !== user.role) {
      await prisma.user.update({ where: { id: user.id }, data: { role } });
    }
    const code = authService.createLoginCode(user.id);
    const { accessToken } = await authService.exchangeLoginCode(code);
    return accessToken;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue(permissiveThrottlerGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    setApiPrefix(app);
    authService = moduleFixture.get(AuthService);
    adminService = moduleFixture.get(AdminService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    adminToken = await tokenFor('admin@school.edu.tw', Role.ADMIN);
    userToken = await tokenFor('plainuser@school.edu.tw', Role.USER);
  });

  afterEach(async () => {
    await prisma.autoApprovedDomain.deleteMany({});
    await prisma.auditLogEntry.deleteMany({});
    await prisma.account.deleteMany({ where: { provider: 'PASSWORD' } });
    await prisma.user.deleteMany({
      where: { account: { provider: 'PASSWORD' } },
    });
  });

  afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  describe('Authorization', () => {
    it('rejects a non-ADMIN User from every admin endpoint', async () => {
      await apiRequest(app)
        .get('/admin/pending-accounts')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      await apiRequest(app)
        .get('/admin/auto-approved-domains')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      await apiRequest(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      await apiRequest(app)
        .patch('/admin/accounts/does-not-matter/reject')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('rejects unauthenticated requests', () => {
      return apiRequest(app).get('/admin/users').expect(401);
    });
  });

  describe('Auto-Approved Domain management', () => {
    it('ADMIN can add and remove a domain', async () => {
      const created = await apiRequest(app)
        .post('/admin/auto-approved-domains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ domain: 'partner.example.com' })
        .expect(201);
      const body = created.body as { id: string; domain: string };
      expect(body.domain).toBe('partner.example.com');

      const list = await apiRequest(app)
        .get('/admin/auto-approved-domains')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (list.body as { domain: string }[]).some(
          (d) => d.domain === 'partner.example.com',
        ),
      ).toBe(true);

      await apiRequest(app)
        .delete(`/admin/auto-approved-domains/${body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('rejects adding a duplicate domain', async () => {
      await apiRequest(app)
        .post('/admin/auto-approved-domains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ domain: 'dupe.example.com' })
        .expect(201);

      await apiRequest(app)
        .post('/admin/auto-approved-domains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ domain: 'dupe.example.com' })
        .expect(409);
    });

    it('defaults a new domain to allowSubdomains: false, and ADMIN can toggle it on and off', async () => {
      const created = await apiRequest(app)
        .post('/admin/auto-approved-domains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ domain: 'subdomain-toggle.example.com' })
        .expect(201);
      const body = created.body as { id: string; allowSubdomains: boolean };
      expect(body.allowSubdomains).toBe(false);

      const enabled = await apiRequest(app)
        .patch(`/admin/auto-approved-domains/${body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ allowSubdomains: true })
        .expect(200);
      expect(
        (enabled.body as { allowSubdomains: boolean }).allowSubdomains,
      ).toBe(true);

      const disabled = await apiRequest(app)
        .patch(`/admin/auto-approved-domains/${body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ allowSubdomains: false })
        .expect(200);
      expect(
        (disabled.body as { allowSubdomains: boolean }).allowSubdomains,
      ).toBe(false);
    });

    it('can add a domain with allowSubdomains true directly', async () => {
      const created = await apiRequest(app)
        .post('/admin/auto-approved-domains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ domain: 'subdomain-onadd.example.com', allowSubdomains: true })
        .expect(201);
      expect(
        (created.body as { allowSubdomains: boolean }).allowSubdomains,
      ).toBe(true);
    });

    it('404s when toggling a domain that does not exist', () => {
      return apiRequest(app)
        .patch('/admin/auto-approved-domains/does-not-exist')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ allowSubdomains: true })
        .expect(404);
    });

    it('rejects toggling with a non-boolean allowSubdomains', async () => {
      const created = await apiRequest(app)
        .post('/admin/auto-approved-domains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ domain: 'subdomain-badinput.example.com' })
        .expect(201);
      const body = created.body as { id: string };

      await apiRequest(app)
        .patch(`/admin/auto-approved-domains/${body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ allowSubdomains: 'yes' })
        .expect(400);

      await apiRequest(app)
        .patch(`/admin/auto-approved-domains/${body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('Account Approval', () => {
    it('lists PENDING Accounts and approves one, setting both Status and Role', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'pendingvendor@unknown.example.com',
          name: '待審核廠商',
          password: 'password123',
        })
        .expect(201);

      const pending = await apiRequest(app)
        .get('/admin/pending-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const entry = (pending.body as { id: string; email: string }[]).find(
        (a) => a.email === 'pendingvendor@unknown.example.com',
      );
      expect(entry).toBeDefined();

      await apiRequest(app)
        .patch(`/admin/accounts/${entry!.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'FACILITY_MANAGER' })
        .expect(200);

      const login = await apiRequest(app)
        .post('/auth/login')
        .send({
          email: 'pendingvendor@unknown.example.com',
          password: 'password123',
        })
        .expect(201);
      expect((login.body as { accessToken: string }).accessToken).toEqual(
        expect.any(String),
      );
    });

    it('rejects approving an already-ACTIVE Account', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'autoactive.example.com' },
      });
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'active@autoactive.example.com',
          name: '已啟用',
          password: 'password123',
        })
        .expect(201);

      const pendingList = await apiRequest(app)
        .get('/admin/pending-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (pendingList.body as { email: string }[]).some(
          (a) => a.email === 'active@autoactive.example.com',
        ),
      ).toBe(false);

      const user = await prisma.user.findUnique({
        where: { email: 'active@autoactive.example.com' },
        include: { account: true },
      });

      await apiRequest(app)
        .patch(`/admin/accounts/${user!.account!.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'USER' })
        .expect(400);
    });
  });

  describe('Account Rejection', () => {
    it('rejects a Pending Account, removing it from the pending list and recording lastRejectionReason/lastRejectedAt', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'reject-me@unknown.example.com',
          name: '待拒絕廠商',
          password: 'password123',
        })
        .expect(201);

      const pending = await apiRequest(app)
        .get('/admin/pending-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const entry = (pending.body as { id: string; email: string }[]).find(
        (a) => a.email === 'reject-me@unknown.example.com',
      );
      expect(entry).toBeDefined();

      await apiRequest(app)
        .patch(`/admin/accounts/${entry!.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '無法確認廠商身分' })
        .expect(200);

      const pendingAfter = await apiRequest(app)
        .get('/admin/pending-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (pendingAfter.body as { email: string }[]).some(
          (a) => a.email === 'reject-me@unknown.example.com',
        ),
      ).toBe(false);

      const account = await prisma.account.findUniqueOrThrow({
        where: { id: entry!.id },
      });
      expect(account.status).toBe('REJECTED');
      expect(account.lastRejectionReason).toBe('無法確認廠商身分');
      expect(account.lastRejectedAt).not.toBeNull();
    });

    it('rejects a Pending Account without a reason', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'reject-no-reason@unknown.example.com',
          name: '無理由拒絕測試',
          password: 'password123',
        })
        .expect(201);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'reject-no-reason@unknown.example.com' },
        include: { account: true },
      });

      await apiRequest(app)
        .patch(`/admin/accounts/${user.account!.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      const account = await prisma.account.findUniqueOrThrow({
        where: { id: user.account!.id },
      });
      expect(account.status).toBe('REJECTED');
      expect(account.lastRejectionReason).toBeNull();
      expect(account.lastRejectedAt).not.toBeNull();
    });

    it('rejects rejecting an already-ACTIVE Account', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'reject-autoactive.example.com' },
      });
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'active@reject-autoactive.example.com',
          name: '已啟用不可拒絕',
          password: 'password123',
        })
        .expect(201);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'active@reject-autoactive.example.com' },
        include: { account: true },
      });

      await apiRequest(app)
        .patch(`/admin/accounts/${user.account!.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
    });

    it('404s when rejecting an Account id that does not exist', () => {
      return apiRequest(app)
        .patch('/admin/accounts/not-a-real-account/reject')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(404);
    });

    it('records an ACCOUNT_REJECTION audit entry with the acting Admin and target Account', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'reject-audit@unknown.example.com',
          name: '稽核紀錄測試',
          password: 'password123',
        })
        .expect(201);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'reject-audit@unknown.example.com' },
        include: { account: true },
      });

      await apiRequest(app)
        .patch(`/admin/accounts/${user.account!.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '測試稽核' })
        .expect(200);

      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@school.edu.tw' },
      });
      const entry = await prisma.auditLogEntry.findFirstOrThrow({
        where: { action: 'ACCOUNT_REJECTION', targetId: user.account!.id },
      });
      expect(entry.actorId).toBe(admin.id);
      expect(entry.targetType).toBe('Account');
      expect(entry.detail).toEqual(expect.stringContaining('測試稽核'));
    });

    it('lets a rejected email register again, reusing the same User row and resetting Account status to PENDING', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'resubmit@unknown.example.com',
          name: '第一次申請',
          password: 'password123',
        })
        .expect(201);
      const firstUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'resubmit@unknown.example.com' },
        include: { account: true },
      });
      await apiRequest(app)
        .patch(`/admin/accounts/${firstUser.account!.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '第一次不通過' })
        .expect(200);

      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'resubmit@unknown.example.com',
          name: '第二次申請',
          password: 'newpassword456',
        })
        .expect(201);

      const secondUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'resubmit@unknown.example.com' },
        include: { account: true },
      });
      expect(secondUser.id).toBe(firstUser.id);
      expect(secondUser.name).toBe('第二次申請');
      expect(secondUser.account!.status).toBe('PENDING');
      // Prior rejection context survives the resubmission, unmodified,
      // for the next reviewing Admin to see.
      expect(secondUser.account!.lastRejectionReason).toBe('第一次不通過');

      const pending = await apiRequest(app)
        .get('/admin/pending-accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (pending.body as { email: string }[]).some(
          (a) => a.email === 'resubmit@unknown.example.com',
        ),
      ).toBe(true);

      const login = await apiRequest(app)
        .post('/auth/login')
        .send({
          email: 'resubmit@unknown.example.com',
          password: 'newpassword456',
        })
        .expect(401);
      expect((login.body as { message: string }).message).toBe(
        '此帳號尚待管理員審核',
      );
    });

    it('lets a rejected email land ACTIVE on resubmission when the domain is now Auto-Approved', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'resubmit-autoapprove@later-approved.example.com',
          name: '重新申請自動核准',
          password: 'password123',
        })
        .expect(201);
      const firstUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'resubmit-autoapprove@later-approved.example.com' },
        include: { account: true },
      });
      await apiRequest(app)
        .patch(`/admin/accounts/${firstUser.account!.id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      await prisma.autoApprovedDomain.create({
        data: { domain: 'later-approved.example.com' },
      });

      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'resubmit-autoapprove@later-approved.example.com',
          name: '重新申請自動核准',
          password: 'password456',
        })
        .expect(201);

      const login = await apiRequest(app)
        .post('/auth/login')
        .send({
          email: 'resubmit-autoapprove@later-approved.example.com',
          password: 'password456',
        })
        .expect(201);
      expect((login.body as { accessToken: string }).accessToken).toEqual(
        expect.any(String),
      );
    });

    it('still rejects registering again while the Account is still PENDING (not REJECTED)', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'still-pending@unknown.example.com',
          name: '仍待審核',
          password: 'password123',
        })
        .expect(201);

      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'still-pending@unknown.example.com',
          name: '重複註冊',
          password: 'password456',
        })
        .expect(409);
    });

    it('still rejects registering again while the Account is ACTIVE', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'still-active.example.com' },
      });
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'dup@still-active.example.com',
          name: '已啟用',
          password: 'password123',
        })
        .expect(201);

      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'dup@still-active.example.com',
          name: '重複註冊',
          password: 'password456',
        })
        .expect(409);
    });
  });

  describe('Account Approval/Rejection race', () => {
    // Raced through the full HTTP boundary (as every other concurrency test
    // in this file does for the last-admin-protection invariant), this
    // exact race window is too narrow to land reliably — mirrors the
    // finding this test closes: RepairsService.updateStatus()'s equivalent
    // race (see repairs.e2e-spec.ts) needed the same fix, for the same
    // documented reason. Calling AdminService.approveAccount()/
    // rejectAccount() directly removes the JWT-guard/HTTP overhead and
    // reliably reproduces both calls reading the same pre-decision PENDING
    // status before either commits.
    it('a concurrent approve racing a reject on the same Pending Account results in exactly one applied decision', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'race-approve-reject@unknown.example.com',
          name: '審核競態測試',
          password: 'password123',
        })
        .expect(201);
      const account = await prisma.account.findFirstOrThrow({
        where: { user: { email: 'race-approve-reject@unknown.example.com' } },
      });
      const adminUserId = (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'admin@school.edu.tw' },
        })
      ).id;
      // A second Admin User, provisioned directly (no HTTP/token needed
      // since this test calls AdminService methods directly) — demoted
      // back to USER at the end so it doesn't count as a remaining Admin
      // in later tests' last-admin-protection checks, matching this
      // file's established pattern for throwaway race-test Admins.
      const { user: secondAdmin } = await authService.loginWithGoogle({
        googleSub: 'sub-race-approve-reject-admin-b@school.edu.tw',
        email: 'race-approve-reject-admin-b@school.edu.tw',
        name: '審核競態測試管理員B',
        hostedDomain: 'school.edu.tw',
      });
      await prisma.user.update({
        where: { id: secondAdmin.id },
        data: { role: Role.ADMIN },
      });
      const secondAdminUserId = secondAdmin.id;

      const [approveRes, rejectRes] = await Promise.allSettled([
        adminService.approveAccount(adminUserId, account.id, {
          role: Role.FACILITY_MANAGER,
        }),
        adminService.rejectAccount(secondAdminUserId, account.id, {
          reason: 'duplicate application',
        }),
      ]);

      // Exactly one of the two must actually persist — the loser must be
      // rejected (a thrown ConflictException, surfaced here as a rejected
      // promise), never silently overwritten or silently overwriting.
      const outcomes = [approveRes.status, rejectRes.status].sort();
      expect(outcomes).toEqual(['fulfilled', 'rejected']);

      const final = await prisma.account.findUniqueOrThrow({
        where: { id: account.id },
      });
      const winnerStatus =
        approveRes.status === 'fulfilled' ? 'ACTIVE' : 'REJECTED';
      expect(final.status).toBe(winnerStatus);

      // The Audit Log Entry trail must agree with the final persisted
      // status — the loser's write (and its would-be audit entry) never
      // happened, so exactly one of ACCOUNT_APPROVAL/ACCOUNT_REJECTION is
      // recorded for this account, matching the winner.
      const entries = await prisma.auditLogEntry.findMany({
        where: { targetType: 'Account', targetId: account.id },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe(
        approveRes.status === 'fulfilled'
          ? 'ACCOUNT_APPROVAL'
          : 'ACCOUNT_REJECTION',
      );

      // Demote back so this throwaway Admin doesn't count as a remaining
      // Admin in later tests' last-admin-protection checks.
      await prisma.user.update({
        where: { id: secondAdminUserId },
        data: { role: Role.USER },
      });
    });
  });

  describe('User role management', () => {
    it('ADMIN can change the Role of an existing active User', async () => {
      const res = await apiRequest(app)
        .patch(
          `/admin/users/${
            (
              await prisma.user.findUniqueOrThrow({
                where: { email: 'plainuser@school.edu.tw' },
              })
            ).id
          }/role`,
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'FACILITY_MANAGER' })
        .expect(200);
      expect((res.body as { role: string }).role).toBe('FACILITY_MANAGER');

      await prisma.user.update({
        where: { email: 'plainuser@school.edu.tw' },
        data: { role: Role.USER },
      });
    });

    it('404s when changing the role of a User that does not exist', () => {
      return apiRequest(app)
        .patch('/admin/users/not-a-real-user/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'USER' })
        .expect(404);
    });

    it('excludes a User whose Account is still PENDING from the user list, and rejects changing its Role directly', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'sidedoor@unknown.example.com',
          name: '側門測試',
          password: 'password123',
        })
        .expect(201);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'sidedoor@unknown.example.com' },
      });

      const list = await apiRequest(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (list.body as { id: string }[]).some((u) => u.id === user.id),
      ).toBe(false);

      await apiRequest(app)
        .patch(`/admin/users/${user.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'FACILITY_MANAGER' })
        .expect(400);
    });

    it('rejects demoting the last remaining ADMIN (including self-demotion), leaving the Role unchanged', async () => {
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@school.edu.tw' },
      });

      await apiRequest(app)
        .patch(`/admin/users/${admin.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'USER' })
        .expect(400);

      const unchanged = await prisma.user.findUniqueOrThrow({
        where: { id: admin.id },
      });
      expect(unchanged.role).toBe('ADMIN');
    });

    it('allows demoting an ADMIN when another ADMIN still remains', async () => {
      await tokenFor('second-admin@school.edu.tw', Role.ADMIN);
      const secondAdmin = await prisma.user.findUniqueOrThrow({
        where: { email: 'second-admin@school.edu.tw' },
      });

      await apiRequest(app)
        .patch(`/admin/users/${secondAdmin.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'USER' })
        .expect(200);

      const updated = await prisma.user.findUniqueOrThrow({
        where: { id: secondAdmin.id },
      });
      expect(updated.role).toBe('USER');
    });
  });

  describe('User list: login method visibility', () => {
    it('reports googleLinked/hasPassword/accountStatus/bookingCount/repairTicketCount for a Google-provisioned User', async () => {
      const list = await apiRequest(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const entry = (
        list.body as {
          email: string;
          googleLinked: boolean;
          hasPassword: boolean;
          accountStatus: string;
          bookingCount: number;
          repairTicketCount: number;
        }[]
      ).find((u) => u.email === 'plainuser@school.edu.tw');
      expect(entry).toMatchObject({
        googleLinked: true,
        hasPassword: false,
        accountStatus: 'ACTIVE',
        bookingCount: 0,
        repairTicketCount: 0,
      });
    });

    it('reports hasPassword: true for a password-registered User', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'loginmethod.example.com' },
      });
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'pw-user@loginmethod.example.com',
          name: '密碼使用者',
          password: 'password123',
        })
        .expect(201);

      const list = await apiRequest(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const entry = (
        list.body as {
          email: string;
          googleLinked: boolean;
          hasPassword: boolean;
        }[]
      ).find((u) => u.email === 'pw-user@loginmethod.example.com');
      expect(entry).toMatchObject({ googleLinked: false, hasPassword: true });
    });
  });

  describe('Account suspension', () => {
    it('ADMIN can suspend an active User, blocking status changes, then reactivate it', async () => {
      await tokenFor('suspend-target@school.edu.tw', Role.USER);
      const targetUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'suspend-target@school.edu.tw' },
      });

      const suspended = await apiRequest(app)
        .patch(`/admin/users/${targetUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      expect((suspended.body as { accountStatus: string }).accountStatus).toBe(
        'SUSPENDED',
      );

      const list = await apiRequest(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (list.body as { id: string; accountStatus: string }[]).find(
          (u) => u.id === targetUser.id,
        )?.accountStatus,
      ).toBe('SUSPENDED');

      const reactivated = await apiRequest(app)
        .patch(`/admin/users/${targetUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(
        (reactivated.body as { accountStatus: string }).accountStatus,
      ).toBe('ACTIVE');
    });

    it('rejects suspending a User whose Account is still PENDING', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'pending-suspend@unknown.example.com',
          name: '待審核停權測試',
          password: 'password123',
        })
        .expect(201);
      const pendingUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'pending-suspend@unknown.example.com' },
      });

      await apiRequest(app)
        .patch(`/admin/users/${pendingUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(400);
    });

    it('rejects suspending the last remaining ADMIN', async () => {
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@school.edu.tw' },
      });

      await apiRequest(app)
        .patch(`/admin/users/${admin.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(400);

      const unchanged = await prisma.user.findUniqueOrThrow({
        where: { id: admin.id },
        include: { account: true },
      });
      expect(unchanged.account!.status).toBe('ACTIVE');
    });

    it('rejects an ADMIN suspending themselves even when another ADMIN remains', async () => {
      await tokenFor('third-admin@school.edu.tw', Role.ADMIN);
      const thirdAdmin = await prisma.user.findUniqueOrThrow({
        where: { email: 'third-admin@school.edu.tw' },
      });
      const thirdAdminToken = await tokenFor(
        'third-admin@school.edu.tw',
        Role.ADMIN,
      );

      await apiRequest(app)
        .patch(`/admin/users/${thirdAdmin.id}/status`)
        .set('Authorization', `Bearer ${thirdAdminToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(400);

      // Demote back so this Google-provisioned test User (never cleaned up
      // by afterEach, which only targets PASSWORD accounts) doesn't count
      // as a remaining ADMIN in later tests.
      await prisma.user.update({
        where: { id: thirdAdmin.id },
        data: { role: Role.USER },
      });
    });

    it('a race between two Admins suspending each other never leaves zero active Admins', async () => {
      const tokenA = await tokenFor('race-suspend-a@school.edu.tw', Role.ADMIN);
      const tokenB = await tokenFor('race-suspend-b@school.edu.tw', Role.ADMIN);
      const [adminA, adminB] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { email: 'race-suspend-a@school.edu.tw' },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: 'race-suspend-b@school.edu.tw' },
        }),
      ]);

      const [resA, resB] = await Promise.all([
        apiRequest(app)
          .patch(`/admin/users/${adminB.id}/status`)
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ status: 'SUSPENDED' }),
        apiRequest(app)
          .patch(`/admin/users/${adminA.id}/status`)
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ status: 'SUSPENDED' }),
      ]);

      // At most one of the two concurrent suspensions may succeed — the
      // race must never leave both Admins SUSPENDED at once.
      expect([resA.status, resB.status].sort()).not.toEqual([200, 200]);

      const [refetchedA, refetchedB] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: adminA.id },
          include: { account: true },
        }),
        prisma.user.findUniqueOrThrow({
          where: { id: adminB.id },
          include: { account: true },
        }),
      ]);
      const activeCount = [refetchedA, refetchedB].filter(
        (u) => u.account!.status === 'ACTIVE',
      ).length;
      expect(activeCount).toBeGreaterThanOrEqual(1);

      // Reset both back to USER so they don't count as remaining Admins for
      // later tests in this file (afterEach only cleans PASSWORD Accounts).
      await prisma.user.updateMany({
        where: { id: { in: [adminA.id, adminB.id] } },
        data: { role: Role.USER },
      });
      await prisma.account.updateMany({
        where: { userId: { in: [adminA.id, adminB.id] } },
        data: { status: 'ACTIVE' },
      });
    });

    it('rejects an unknown status value', async () => {
      const targetUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'plainuser@school.edu.tw' },
      });
      await apiRequest(app)
        .patch(`/admin/users/${targetUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('404s when suspending a User that does not exist', () => {
      return apiRequest(app)
        .patch('/admin/users/not-a-real-user/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(404);
    });
  });

  describe('User deletion', () => {
    async function makeRoom() {
      return prisma.room.create({
        data: {
          name: '刪除測試室',
          location: '1F',
          capacity: 4,
          equipment: [],
          requiresApproval: false,
        },
      });
    }

    it('hard-deletes a User, cascading their Bookings and Repair Tickets, and records a USER_DELETION audit entry', async () => {
      await tokenFor('delete-target@school.edu.tw', Role.USER);
      const target = await prisma.user.findUniqueOrThrow({
        where: { email: 'delete-target@school.edu.tw' },
      });
      const room = await makeRoom();
      await prisma.booking.create({
        data: {
          roomId: room.id,
          userId: target.id,
          title: '待刪除的預約',
          startTime: new Date(Date.now() + 60 * 60 * 1000),
          endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
          status: 'CONFIRMED',
        },
      });
      await prisma.repairTicket.create({
        data: {
          location: '2F 走廊',
          userId: target.id,
          category: '硬體設備',
          description: '待刪除的報修單',
          status: 'PENDING',
        },
      });
      // A prior action performed by the target (as an earlier ADMIN) so we
      // can verify its Audit Log Entry survives with a name snapshot.
      await prisma.auditLogEntry.create({
        data: {
          actorId: target.id,
          action: 'ROLE_CHANGE',
          targetType: 'User',
          targetId: 'irrelevant',
          detail: 'Role changed from USER to FACILITY_MANAGER',
        },
      });

      await apiRequest(app)
        .delete(`/admin/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(
        await prisma.user.findUnique({ where: { id: target.id } }),
      ).toBeNull();
      expect(
        await prisma.booking.findMany({ where: { userId: target.id } }),
      ).toHaveLength(0);
      expect(
        await prisma.repairTicket.findMany({ where: { userId: target.id } }),
      ).toHaveLength(0);

      const priorEntry = await prisma.auditLogEntry.findFirstOrThrow({
        where: {
          action: 'ROLE_CHANGE',
          detail: { contains: 'FACILITY_MANAGER' },
        },
      });
      expect(priorEntry.actorId).toBeNull();
      expect(priorEntry.actorName).toBe('delete-target@school.edu.tw');

      const deletionEntry = await prisma.auditLogEntry.findFirstOrThrow({
        where: { action: 'USER_DELETION', targetId: target.id },
      });
      expect(deletionEntry.actorId).toBe(
        (
          await prisma.user.findUniqueOrThrow({
            where: { email: 'admin@school.edu.tw' },
          })
        ).id,
      );
      expect(deletionEntry.detail).toEqual(
        expect.stringContaining('1 Booking'),
      );
      expect(deletionEntry.detail).toEqual(
        expect.stringContaining('1 Repair Ticket'),
      );
    });

    it('rejects deleting the last remaining ADMIN', async () => {
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@school.edu.tw' },
      });

      await apiRequest(app)
        .delete(`/admin/users/${admin.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(
        await prisma.user.findUnique({ where: { id: admin.id } }),
      ).not.toBeNull();
    });

    it('rejects an ADMIN deleting themselves even when another ADMIN remains', async () => {
      await tokenFor('fourth-admin@school.edu.tw', Role.ADMIN);
      const fourthAdmin = await prisma.user.findUniqueOrThrow({
        where: { email: 'fourth-admin@school.edu.tw' },
      });
      const fourthAdminToken = await tokenFor(
        'fourth-admin@school.edu.tw',
        Role.ADMIN,
      );

      await apiRequest(app)
        .delete(`/admin/users/${fourthAdmin.id}`)
        .set('Authorization', `Bearer ${fourthAdminToken}`)
        .expect(400);
    });

    it('404s when deleting a User that does not exist', () => {
      return apiRequest(app)
        .delete('/admin/users/not-a-real-user')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('a race between two Admins deleting each other never leaves zero Admins', async () => {
      const tokenA = await tokenFor('race-delete-a@school.edu.tw', Role.ADMIN);
      const tokenB = await tokenFor('race-delete-b@school.edu.tw', Role.ADMIN);
      const [adminA, adminB] = await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { email: 'race-delete-a@school.edu.tw' },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: 'race-delete-b@school.edu.tw' },
        }),
      ]);

      const [resA, resB] = await Promise.all([
        apiRequest(app)
          .delete(`/admin/users/${adminB.id}`)
          .set('Authorization', `Bearer ${tokenA}`),
        apiRequest(app)
          .delete(`/admin/users/${adminA.id}`)
          .set('Authorization', `Bearer ${tokenB}`),
      ]);

      // At most one of the two concurrent deletions may succeed — the race
      // must never leave both Admins deleted at once.
      expect([resA.status, resB.status].sort()).not.toEqual([204, 204]);

      const survivors = await prisma.user.findMany({
        where: { id: { in: [adminA.id, adminB.id] } },
      });
      expect(survivors.length).toBeGreaterThanOrEqual(1);

      // Clean up whichever survived so it doesn't count as a remaining
      // Admin for later tests in this file.
      if (survivors.length > 0) {
        await prisma.account.deleteMany({
          where: { userId: { in: survivors.map((u) => u.id) } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: survivors.map((u) => u.id) } },
        });
      }
    });
  });
});
