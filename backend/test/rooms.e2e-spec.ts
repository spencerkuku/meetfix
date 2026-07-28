import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { existsSync, rmSync } from 'fs';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
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

interface RoomResponse {
  id: string;
  name: string;
  location: string;
  capacity: number | null;
  equipment: string[];
  imageUrl: string | null;
  requiresApproval: boolean;
}

describe('Rooms (e2e)', () => {
  let app: NestExpressApplication;
  let authService: AuthService;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;
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
    setApiPrefix(app);
    serveUploads(app);
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    adminToken = await tokenFor('admin@school.edu.tw', Role.ADMIN);
    userToken = await tokenFor('user@school.edu.tw', Role.USER);
  });

  afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    for (const path of createdUploadPaths) {
      if (existsSync(path)) rmSync(path);
    }
    await app.close();
  });

  it('any authenticated User can list Rooms', async () => {
    const res = await apiRequest(app)
      .get('/rooms')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects unauthenticated requests', () => {
    return apiRequest(app).get('/rooms').expect(401);
  });

  it('rejects room creation by a non-Admin User', () => {
    return apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${userToken}`)
      .field('name', 'A101')
      .field('location', '1F')
      .field('capacity', '10')
      .attach('photo', PNG_BYTES, 'room.png')
      .expect(403);
  });

  it('rejects room updates by a non-Admin User', async () => {
    const created = await apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Update-Auth-Check')
      .field('location', '1F')
      .field('capacity', '5')
      .attach('photo', PNG_BYTES, 'x.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(uploadFilePath(createdBody.imageUrl!));

    await apiRequest(app)
      .patch(`/rooms/${createdBody.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .field('capacity', '99')
      .expect(403);
  });

  it('rejects room deletion by a non-Admin User', async () => {
    const created = await apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Delete-Auth-Check')
      .field('location', '1F')
      .field('capacity', '5')
      .attach('photo', PNG_BYTES, 'x.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(uploadFilePath(createdBody.imageUrl!));

    await apiRequest(app)
      .delete(`/rooms/${createdBody.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('rejects a non-positive capacity with a clean 400, not a raw DB error', () => {
    return apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Bad Capacity')
      .field('location', '1F')
      .field('capacity', '0')
      .attach('photo', PNG_BYTES, 'x.png')
      .expect(400);
  });

  it('Admin can create a Room with a photo, and the photo is retrievable', async () => {
    const res = await apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'A101 會議室')
      .field('location', '1F')
      .field('capacity', '10')
      .field('equipment', '投影機, 白板')
      .field('requiresApproval', 'false')
      .attach('photo', PNG_BYTES, 'room.png')
      .expect(201);

    const body = res.body as RoomResponse;
    expect(body).toMatchObject({
      name: 'A101 會議室',
      capacity: 10,
      equipment: ['投影機', '白板'],
      requiresApproval: false,
    });
    expect(body.imageUrl).toMatch(/^\/api\/uploads\/rooms\/.+\.png$/);
    createdUploadPaths.push(uploadFilePath(body.imageUrl!));

    // Not apiRequest: imageUrl is already the full path the server
    // returned (including the API prefix), not a bare route to prefix.
    const photoRes = await request(app.getHttpServer())
      .get(body.imageUrl!)
      .expect(200);
    expect(photoRes.body).toEqual(PNG_BYTES);
  });

  it('Admin can update a Room without replacing the photo', async () => {
    const created = await apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'B202')
      .field('location', '1F')
      .field('capacity', '4')
      .attach('photo', PNG_BYTES, 'b202.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(uploadFilePath(createdBody.imageUrl!));

    const updated = await apiRequest(app)
      .patch(`/rooms/${createdBody.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('capacity', '6')
      .expect(200);
    const updatedBody = updated.body as RoomResponse;

    expect(updatedBody.capacity).toBe(6);
    expect(updatedBody.imageUrl).toBe(createdBody.imageUrl);
  });

  it('Admin can delete a Room', async () => {
    const created = await apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'To Delete')
      .field('location', '1F')
      .field('capacity', '2')
      .attach('photo', PNG_BYTES, 'x.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(uploadFilePath(createdBody.imageUrl!));

    await apiRequest(app)
      .delete(`/rooms/${createdBody.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const list = await apiRequest(app)
      .get('/rooms')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const listBody = list.body as RoomResponse[];
    expect(listBody.find((r) => r.id === createdBody.id)).toBeUndefined();
  });

  it('rejects a photo upload whose content is not a real image, regardless of declared filename/mimetype', () => {
    return apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Fake Photo Room')
      .field('location', '1F')
      .field('capacity', '10')
      .attach('photo', Buffer.from('not-a-real-image'), {
        filename: 'room.png',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('rejects an SVG upload masquerading as a photo (stored XSS vector)', () => {
    const svgPayload = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    return apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'SVG XSS Room')
      .field('location', '1F')
      .field('capacity', '10')
      .attach('photo', svgPayload, {
        filename: 'x.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
  });

  it('Admin can create a Room with only a name and location (#19)', async () => {
    const res = await apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Minimal Room')
      .field('location', '3F 儲藏室旁')
      .expect(201);

    const body = res.body as RoomResponse;
    expect(body).toMatchObject({
      name: 'Minimal Room',
      location: '3F 儲藏室旁',
      capacity: null,
      imageUrl: null,
    });
  });

  it('rejects Room creation without a location', () => {
    return apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'No Location Room')
      .expect(400);
  });

  it('a Room created without capacity persists capacity as null, not 0', async () => {
    const res = await apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'No Capacity Room')
      .field('location', '2F')
      .expect(201);
    const createdBody = res.body as RoomResponse;

    const list = await apiRequest(app)
      .get('/rooms')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const listBody = list.body as RoomResponse[];
    expect(listBody.find((r) => r.id === createdBody.id)?.capacity).toBeNull();
  });

  it('serves uploaded photos with X-Content-Type-Options: nosniff', async () => {
    const created = await apiRequest(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Nosniff Check')
      .field('location', '1F')
      .field('capacity', '3')
      .attach('photo', PNG_BYTES, 'room.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(uploadFilePath(createdBody.imageUrl!));

    // Not apiRequest: imageUrl already includes the API prefix.
    const photoRes = await request(app.getHttpServer())
      .get(createdBody.imageUrl!)
      .expect(200);
    expect(photoRes.headers['x-content-type-options']).toBe('nosniff');
  });
});
