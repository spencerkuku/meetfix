import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { Role } from '@prisma/client';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';

describe('Admin (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
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
    }).compile();

    app = moduleFixture.createNestApplication();
    setApiPrefix(app);
    authService = moduleFixture.get(AuthService);
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
      const entry = (
        pending.body as { id: string; email: string }[]
      ).find((a) => a.email === 'pendingvendor@unknown.example.com');
      expect(entry).toBeDefined();

      await apiRequest(app)
        .patch(`/admin/accounts/${entry!.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'MAINTENANCE' })
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

  describe('User role management', () => {
    it('ADMIN can change the Role of an existing active User', async () => {
      const res = await apiRequest(app)
        .patch(`/admin/users/${(
          await prisma.user.findUniqueOrThrow({
            where: { email: 'plainuser@school.edu.tw' },
          })
        ).id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ROOM_MANAGER' })
        .expect(200);
      expect((res.body as { role: string }).role).toBe('ROOM_MANAGER');

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
        .send({ role: 'MAINTENANCE' })
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
});
