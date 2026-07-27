import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { Role } from '@prisma/client';

interface RepairTicketResponse {
  id: string;
  roomId: string | null;
  location: string;
  category: string;
  description: string;
  imageUrl: string | null;
  status: string;
  userName: string;
}

interface RepairCategoryResponse {
  id: string;
  name: string;
}

describe('Repairs (e2e)', () => {
  let app: NestExpressApplication;
  let authService: AuthService;
  let prisma: PrismaService;
  let userToken: string;
  let adminToken: string;
  let maintenanceToken: string;
  let roomId: string;
  const createdUploadPaths: string[] = [];

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

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads',
    });
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    userToken = await tokenFor('reporter@school.edu.tw', Role.USER);
    adminToken = await tokenFor('repairadmin@school.edu.tw', Role.ADMIN);
    maintenanceToken = await tokenFor('repairmaint@school.edu.tw', Role.MAINTENANCE);

    const room = await prisma.room.create({
      data: {
        name: 'B202 討論室',
        capacity: 4,
        equipment: [],
        imageUrl: '/uploads/rooms/x.png',
        requiresApproval: false,
      },
    });
    roomId = room.id;
  });

  afterAll(async () => {
    await prisma.repairTicket.deleteMany({});
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.repairCategory.deleteMany({
      where: { name: { startsWith: 'Test Category' } },
    });
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    for (const path of createdUploadPaths) {
      if (existsSync(path)) rmSync(path);
    }
    await app.close();
  });

  it('rejects unauthenticated requests', () => {
    return request(app.getHttpServer()).get('/repairs').expect(401);
  });

  it('any authenticated User can submit a Repair Ticket without a photo', async () => {
    const res = await request(app.getHttpServer())
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', 'A101 會議室')
      .field('category', '硬體設備')
      .field('description', '投影機燈泡閃爍')
      .expect(201);

    const body = res.body as RepairTicketResponse;
    expect(body.status).toBe('PENDING');
    expect(body.imageUrl).toBeNull();
    expect(body.userName).toEqual(expect.any(String));
  });

  it('any authenticated User can submit a Repair Ticket with a photo, and the photo is retrievable', async () => {
    const res = await request(app.getHttpServer())
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', '一樓大廳')
      .field('category', '桌椅家具')
      .field('description', '咖啡機漏水')
      .field('userClass', '資訊三甲')
      .field('userPhone', '0912-345-678')
      .attach('photo', Buffer.from('fake-image-bytes'), 'issue.png')
      .expect(201);

    const body = res.body as RepairTicketResponse;
    expect(body.imageUrl).toMatch(/^\/uploads\/repairs\/.+\.png$/);
    createdUploadPaths.push(join(process.cwd(), body.imageUrl as string));

    const photoRes = await request(app.getHttpServer())
      .get(body.imageUrl as string)
      .expect(200);
    expect(photoRes.body).toEqual(Buffer.from('fake-image-bytes'));
  });

  it('rejects submission missing required fields', () => {
    return request(app.getHttpServer())
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', 'A101')
      .expect(400);
  });

  it('rejects submission with a category that is not in the Admin-managed list', () => {
    return request(app.getHttpServer())
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', 'A101')
      .field('category', 'Not A Real Category')
      .field('description', 'test')
      .expect(400);
  });

  it('a Repair Ticket tied to a real Room defaults its location to the Room name', async () => {
    const res = await request(app.getHttpServer())
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('roomId', roomId)
      .field('category', '硬體設備')
      .field('description', '電視螢幕無法開機')
      .expect(201);

    const body = res.body as RepairTicketResponse;
    expect(body.roomId).toBe(roomId);
    expect(body.location).toBe('B202 討論室');
  });

  it('rejects a Repair Ticket tied to a Room that does not exist', () => {
    return request(app.getHttpServer())
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('roomId', 'not-a-real-room')
      .field('category', '硬體設備')
      .field('description', 'test')
      .expect(404);
  });

  describe('Repair Ticket processing (Maintenance)', () => {
    async function createTicket(): Promise<string> {
      const res = await request(app.getHttpServer())
        .post('/repairs')
        .set('Authorization', `Bearer ${userToken}`)
        .field('location', 'C303 教室')
        .field('category', '硬體設備')
        .field('description', '燈管不亮')
        .expect(201);
      return (res.body as RepairTicketResponse).id;
    }

    it('rejects updates from a non-MAINTENANCE, non-ADMIN User', async () => {
      const id = await createTicket();
      await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(403);
    });

    it('MAINTENANCE can move a ticket PENDING -> IN_PROGRESS -> COMPLETED', async () => {
      const id = await createTicket();

      const started = await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect((started.body as RepairTicketResponse).status).toBe(
        'IN_PROGRESS',
      );

      const completed = await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect((completed.body as RepairTicketResponse).status).toBe(
        'COMPLETED',
      );
    });

    it('ADMIN can also move a ticket through the workflow', async () => {
      const id = await createTicket();
      const res = await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect((res.body as RepairTicketResponse).status).toBe('IN_PROGRESS');
    });

    it('rejects skipping a status (PENDING -> COMPLETED)', async () => {
      const id = await createTicket();
      await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'COMPLETED' })
        .expect(400);
    });

    it('rejects moving a COMPLETED ticket back to PENDING', async () => {
      const id = await createTicket();
      await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('MAINTENANCE can attach a reply when updating a ticket', async () => {
      const id = await createTicket();
      const res = await request(app.getHttpServer())
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS', adminReply: '已預約零件，明日到場處理' })
        .expect(200);
      expect((res.body as RepairTicketResponse & { adminReply: string }).adminReply).toBe(
        '已預約零件，明日到場處理',
      );
    });

    it('404s when updating a Repair Ticket that does not exist', () => {
      return request(app.getHttpServer())
        .patch('/repairs/not-a-real-ticket')
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(404);
    });
  });

  describe('Repair Categories', () => {
    it('any authenticated User can list Repair Categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/repair-categories')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('rejects category creation by a non-Admin User', () => {
      return request(app.getHttpServer())
        .post('/repair-categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Test Category Denied' })
        .expect(403);
    });

    it('Admin can create and remove a Repair Category', async () => {
      const created = await request(app.getHttpServer())
        .post('/repair-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Category A' })
        .expect(201);
      const body = created.body as RepairCategoryResponse;
      expect(body.name).toBe('Test Category A');

      await request(app.getHttpServer())
        .delete(`/repair-categories/${body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('rejects category deletion by a non-Admin User', async () => {
      const created = await request(app.getHttpServer())
        .post('/repair-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Category B' })
        .expect(201);
      const body = created.body as RepairCategoryResponse;

      await request(app.getHttpServer())
        .delete(`/repair-categories/${body.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('rejects creating a duplicate Repair Category', async () => {
      await request(app.getHttpServer())
        .post('/repair-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Category C' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/repair-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Category C' })
        .expect(409);
    });
  });
});
