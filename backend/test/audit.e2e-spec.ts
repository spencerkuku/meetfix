import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { Role } from '@prisma/client';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';

interface AuditLogEntryResponse {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
}

describe('Audit Log (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let prisma: PrismaService;
  let adminToken: string;
  let adminId: string;
  let roomManagerToken: string;
  let userToken: string;
  let maintenanceToken: string;
  let roomId: string;

  async function tokenFor(
    email: string,
    role: Role,
  ): Promise<{ id: string; token: string }> {
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
    return { id: user.id, token: accessToken };
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

    const admin = await tokenFor('audit-admin@school.edu.tw', Role.ADMIN);
    adminToken = admin.token;
    adminId = admin.id;
    roomManagerToken = (
      await tokenFor('audit-rm@school.edu.tw', Role.ROOM_MANAGER)
    ).token;
    userToken = (await tokenFor('audit-user@school.edu.tw', Role.USER)).token;
    maintenanceToken = (
      await tokenFor('audit-maint@school.edu.tw', Role.MAINTENANCE)
    ).token;

    const room = await prisma.room.create({
      data: {
        name: '稽核測試室',
        capacity: 4,
        equipment: [],
        imageUrl: '/uploads/rooms/x.png',
        requiresApproval: true,
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({});
    await prisma.repairTicket.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('rejects reading the Audit Log as a non-ADMIN', () => {
    return apiRequest(app)
      .get('/audit-log')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('rejects unauthenticated reads', () => {
    return apiRequest(app).get('/audit-log').expect(401);
  });

  it('a Role change writes exactly one correctly-attributed entry', async () => {
    const target = await tokenFor('audit-target1@school.edu.tw', Role.USER);

    await apiRequest(app)
      .patch(`/admin/users/${target.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'ROOM_MANAGER' })
      .expect(200);

    const entries = await prisma.auditLogEntry.findMany({
      where: { action: 'ROLE_CHANGE', targetId: target.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].actorId).toBe(adminId);
    expect(entries[0].targetType).toBe('User');
  });

  it('a Booking Approval (approve or reject) writes exactly one correctly-attributed entry', async () => {
    const requester = await tokenFor('audit-req1@school.edu.tw', Role.USER);
    const created = await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${requester.token}`)
      .send({
        roomId,
        title: '稽核測試會議',
        startTime: '2027-01-01T02:00:00.000Z',
        endTime: '2027-01-01T03:00:00.000Z',
      })
      .expect(201);
    const bookingId = (created.body as { id: string }).id;

    await apiRequest(app)
      .patch(`/bookings/${bookingId}/approve`)
      .set('Authorization', `Bearer ${roomManagerToken}`)
      .expect(200);

    const entries = await prisma.auditLogEntry.findMany({
      where: { action: 'BOOKING_APPROVAL', targetId: bookingId },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].targetType).toBe('Booking');
    expect(entries[0].detail).toBe('Approved');
  });

  it('an Account Approval writes exactly one correctly-attributed entry', async () => {
    await apiRequest(app)
      .post('/auth/register')
      .send({
        email: 'audit-pending@unknown.example.com',
        name: '稽核待審核',
        password: 'password123',
      })
      .expect(201);
    const pendingUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'audit-pending@unknown.example.com' },
      include: { account: true },
    });

    await apiRequest(app)
      .patch(`/admin/accounts/${pendingUser.account!.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'USER' })
      .expect(200);

    const entries = await prisma.auditLogEntry.findMany({
      where: {
        action: 'ACCOUNT_APPROVAL',
        targetId: pendingUser.account!.id,
      },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].targetType).toBe('Account');
  });

  it('a Repair Status change writes exactly one correctly-attributed entry, but a reply-only update writes none', async () => {
    const reporter = await tokenFor('audit-reporter1@school.edu.tw', Role.USER);
    const ticket = await apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${reporter.token}`)
      .field('location', '稽核測試地點')
      .field('category', '硬體設備')
      .field('description', '測試用')
      .expect(201);
    const ticketId = (ticket.body as { id: string }).id;

    await apiRequest(app)
      .patch(`/repairs/${ticketId}`)
      .set('Authorization', `Bearer ${maintenanceToken}`)
      .send({ adminReply: '純回覆，不改狀態' })
      .expect(200);

    await apiRequest(app)
      .patch(`/repairs/${ticketId}`)
      .set('Authorization', `Bearer ${maintenanceToken}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    const entries = await prisma.auditLogEntry.findMany({
      where: { action: 'REPAIR_STATUS_CHANGE', targetId: ticketId },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].targetType).toBe('RepairTicket');
  });

  it('ADMIN can read the accumulated Audit Log entries', async () => {
    const res = await apiRequest(app)
      .get('/audit-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as AuditLogEntryResponse[];
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toMatchObject({
      actorName: expect.any(String),
      actorEmail: expect.any(String),
      action: expect.any(String),
      targetType: expect.any(String),
      targetId: expect.any(String),
    });
  });
});
