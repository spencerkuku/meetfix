import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { Role } from '@prisma/client';

interface RoomResponse {
  id: string;
  name: string;
  capacity: number;
  equipment: string[];
  imageUrl: string;
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
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads',
    });
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    adminToken = await tokenFor('admin@school.edu.tw', Role.ADMIN);
    userToken = await tokenFor('user@school.edu.tw', Role.USER);
  });

  afterAll(async () => {
    await prisma.room.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    for (const path of createdUploadPaths) {
      if (existsSync(path)) rmSync(path);
    }
    await app.close();
  });

  it('any authenticated User can list Rooms', async () => {
    const res = await request(app.getHttpServer())
      .get('/rooms')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects unauthenticated requests', () => {
    return request(app.getHttpServer()).get('/rooms').expect(401);
  });

  it('rejects room creation by a non-Admin User', () => {
    return request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${userToken}`)
      .field('name', 'A101')
      .field('capacity', '10')
      .attach('photo', Buffer.from('fake-image-bytes'), 'room.png')
      .expect(403);
  });

  it('rejects room updates by a non-Admin User', async () => {
    const created = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Update-Auth-Check')
      .field('capacity', '5')
      .attach('photo', Buffer.from('x'), 'x.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(join(process.cwd(), createdBody.imageUrl));

    await request(app.getHttpServer())
      .patch(`/rooms/${createdBody.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .field('capacity', '99')
      .expect(403);
  });

  it('rejects room deletion by a non-Admin User', async () => {
    const created = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Delete-Auth-Check')
      .field('capacity', '5')
      .attach('photo', Buffer.from('x'), 'x.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(join(process.cwd(), createdBody.imageUrl));

    await request(app.getHttpServer())
      .delete(`/rooms/${createdBody.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('rejects a non-positive capacity with a clean 400, not a raw DB error', () => {
    return request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'Bad Capacity')
      .field('capacity', '0')
      .attach('photo', Buffer.from('x'), 'x.png')
      .expect(400);
  });

  it('Admin can create a Room with a photo, and the photo is retrievable', async () => {
    const res = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'A101 會議室')
      .field('capacity', '10')
      .field('equipment', '投影機, 白板')
      .field('requiresApproval', 'false')
      .attach('photo', Buffer.from('fake-image-bytes'), 'room.png')
      .expect(201);

    const body = res.body as RoomResponse;
    expect(body).toMatchObject({
      name: 'A101 會議室',
      capacity: 10,
      equipment: ['投影機', '白板'],
      requiresApproval: false,
    });
    expect(body.imageUrl).toMatch(/^\/uploads\/rooms\/.+\.png$/);
    createdUploadPaths.push(join(process.cwd(), body.imageUrl));

    const photoRes = await request(app.getHttpServer())
      .get(body.imageUrl)
      .expect(200);
    expect(photoRes.body).toEqual(Buffer.from('fake-image-bytes'));
  });

  it('Admin can update a Room without replacing the photo', async () => {
    const created = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'B202')
      .field('capacity', '4')
      .attach('photo', Buffer.from('original'), 'b202.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(join(process.cwd(), createdBody.imageUrl));

    const updated = await request(app.getHttpServer())
      .patch(`/rooms/${createdBody.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('capacity', '6')
      .expect(200);
    const updatedBody = updated.body as RoomResponse;

    expect(updatedBody.capacity).toBe(6);
    expect(updatedBody.imageUrl).toBe(createdBody.imageUrl);
  });

  it('Admin can delete a Room', async () => {
    const created = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', 'To Delete')
      .field('capacity', '2')
      .attach('photo', Buffer.from('x'), 'x.png')
      .expect(201);
    const createdBody = created.body as RoomResponse;
    createdUploadPaths.push(join(process.cwd(), createdBody.imageUrl));

    await request(app.getHttpServer())
      .delete(`/rooms/${createdBody.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const list = await request(app.getHttpServer())
      .get('/rooms')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const listBody = list.body as RoomResponse[];
    expect(listBody.find((r) => r.id === createdBody.id)).toBeUndefined();
  });
});
