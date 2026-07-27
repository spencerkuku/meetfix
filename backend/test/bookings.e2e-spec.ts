import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';

interface BookingResponse {
  id: string;
  roomId: string;
  userId: string;
  status: 'CONFIRMED' | 'PENDING_APPROVAL' | 'REJECTED' | 'CANCELLED';
  startTime: string;
  endTime: string;
}

describe('Bookings (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let prisma: PrismaService;
  let userToken: string;
  let userId: string;
  let otherUserToken: string;
  let openRoomId: string;
  let approvalRoomId: string;

  async function tokenFor(
    email: string,
  ): Promise<{ token: string; userId: string }> {
    const { user } = await authService.loginWithGoogle({
      googleSub: `sub-${email}`,
      email,
      name: email,
      hostedDomain: 'school.edu.tw',
    });
    const code = authService.createLoginCode(user.id);
    const { accessToken } = await authService.exchangeLoginCode(code);
    return { token: accessToken, userId: user.id };
  }

  // Every test picks a fresh, far-future hour so tests never collide with
  // each other's Bookings on the same shared Room.
  let hourCursor = 0;
  function nextSlot(): { startTime: string; endTime: string } {
    hourCursor += 1;
    const start = new Date('2030-01-01T00:00:00.000Z');
    start.setUTCHours(start.getUTCHours() + hourCursor);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const user = await tokenFor('booker@school.edu.tw');
    userToken = user.token;
    userId = user.userId;
    const other = await tokenFor('other@school.edu.tw');
    otherUserToken = other.token;

    const openRoom = await prisma.room.create({
      data: {
        name: 'Open Room',
        capacity: 4,
        equipment: [],
        imageUrl: '/uploads/rooms/x.png',
        requiresApproval: false,
      },
    });
    openRoomId = openRoom.id;

    const approvalRoom = await prisma.room.create({
      data: {
        name: 'Approval Room',
        capacity: 4,
        equipment: [],
        imageUrl: '/uploads/rooms/y.png',
        requiresApproval: true,
      },
    });
    approvalRoomId = approvalRoom.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({});
    await prisma.room.deleteMany({
      where: { id: { in: [openRoomId, approvalRoomId] } },
    });
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('rejects unauthenticated requests', () => {
    return request(app.getHttpServer()).get('/bookings').expect(401);
  });

  it('a Booking on a non-approval Room is created directly as CONFIRMED', async () => {
    const slot = nextSlot();
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: '週會', ...slot })
      .expect(201);

    const body = res.body as BookingResponse;
    expect(body.status).toBe('CONFIRMED');
    expect(body.roomId).toBe(openRoomId);
  });

  it('a Booking on an approval-required Room is created as PENDING_APPROVAL', async () => {
    const slot = nextSlot();
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: approvalRoomId, title: '董事會', ...slot })
      .expect(201);

    const body = res.body as BookingResponse;
    expect(body.status).toBe('PENDING_APPROVAL');
  });

  it('rejects a Booking that overlaps an existing CONFIRMED Booking on the same Room', async () => {
    const slot = nextSlot();
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'First', ...slot })
      .expect(201);

    // Overlaps the first booking's second half-hour.
    const overlapStart = new Date(
      new Date(slot.startTime).getTime() + 30 * 60 * 1000,
    ).toISOString();
    const overlapEnd = new Date(
      new Date(slot.endTime).getTime() + 30 * 60 * 1000,
    ).toISOString();

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({
        roomId: openRoomId,
        title: 'Conflicting',
        startTime: overlapStart,
        endTime: overlapEnd,
      })
      .expect(409);
  });

  it('accepts a non-overlapping Booking on the same Room', async () => {
    const slotA = nextSlot();
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'A', ...slotA })
      .expect(201);

    const slotB = nextSlot(); // a fully separate hour — no overlap
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'B', ...slotB })
      .expect(201);
  });

  it('accepts an overlapping-time Booking on a different Room', async () => {
    const slot = nextSlot();
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'Room A booking', ...slot })
      .expect(201);

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: approvalRoomId, title: 'Room B booking', ...slot })
      .expect(201);
  });

  it('a PENDING_APPROVAL Booking still blocks a conflicting request on the same Room', async () => {
    const slot = nextSlot();
    const pending = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: approvalRoomId, title: 'Pending first', ...slot })
      .expect(201);
    expect((pending.body as BookingResponse).status).toBe('PENDING_APPROVAL');

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({ roomId: approvalRoomId, title: 'Should conflict', ...slot })
      .expect(409);
  });

  it('cancelling a Booking releases its slot for a new request', async () => {
    const slot = nextSlot();
    const created = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'To cancel', ...slot })
      .expect(201);
    const createdBody = created.body as BookingResponse;

    await request(app.getHttpServer())
      .patch(`/bookings/${createdBody.id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({ roomId: openRoomId, title: 'Takes the freed slot', ...slot })
      .expect(201);
  });

  it('rejects cancelling a Booking that belongs to someone else', async () => {
    const slot = nextSlot();
    const created = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'Not yours', ...slot })
      .expect(201);
    const createdBody = created.body as BookingResponse;

    await request(app.getHttpServer())
      .patch(`/bookings/${createdBody.id}/cancel`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .expect(403);
  });

  it('rejects creating a Booking where endTime is not after startTime', () => {
    const slot = nextSlot();
    return request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        roomId: openRoomId,
        title: 'Backwards',
        startTime: slot.endTime,
        endTime: slot.startTime,
      })
      .expect(400);
  });

  it('rejects creating a Booking for a Room that does not exist', () => {
    const slot = nextSlot();
    return request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: 'not-a-real-room', title: 'Ghost room', ...slot })
      .expect(404);
  });

  it('the creating User owns the Booking', async () => {
    const slot = nextSlot();
    const created = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'Ownership check', ...slot })
      .expect(201);
    expect((created.body as BookingResponse).userId).toBe(userId);
  });
});
