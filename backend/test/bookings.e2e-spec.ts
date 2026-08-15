import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { Role } from '@prisma/client';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';
import { permissiveThrottlerGuard } from './support/permissive-throttler-guard';

interface BookingResponse {
  id: string;
  roomId: string;
  userId: string;
  title: string;
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
  let facilityManagerToken: string;
  let adminToken: string;
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

  async function tokenForRole(email: string, role: Role): Promise<string> {
    const { userId: id } = await tokenFor(email);
    await prisma.user.update({ where: { id }, data: { role } });
    const code = authService.createLoginCode(id);
    const { accessToken } = await authService.exchangeLoginCode(code);
    return accessToken;
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
    })
      .overrideGuard(ThrottlerGuard)
      .useValue(permissiveThrottlerGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    setApiPrefix(app);
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const user = await tokenFor('booker@school.edu.tw');
    userToken = user.token;
    userId = user.userId;
    const other = await tokenFor('other@school.edu.tw');
    otherUserToken = other.token;
    facilityManagerToken = await tokenForRole(
      'manager@school.edu.tw',
      Role.FACILITY_MANAGER,
    );
    adminToken = await tokenForRole('admin@school.edu.tw', Role.ADMIN);

    const openRoom = await prisma.room.create({
      data: {
        name: 'Open Room',
        location: '1F',
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
        location: '2F',
        capacity: 4,
        equipment: [],
        imageUrl: '/uploads/rooms/y.png',
        requiresApproval: true,
      },
    });
    approvalRoomId = approvalRoom.id;
  });

  afterAll(async () => {
    await prisma.auditLogEntry.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.room.deleteMany({
      where: { id: { in: [openRoomId, approvalRoomId] } },
    });
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('rejects unauthenticated requests', () => {
    return apiRequest(app).get('/bookings').expect(401);
  });

  it('a Booking on a non-approval Room is created directly as CONFIRMED', async () => {
    const slot = nextSlot();
    const res = await apiRequest(app)
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
    const res = await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: approvalRoomId, title: '董事會', ...slot })
      .expect(201);

    const body = res.body as BookingResponse;
    expect(body.status).toBe('PENDING_APPROVAL');
  });

  it('rejects a Booking that overlaps an existing CONFIRMED Booking on the same Room', async () => {
    const slot = nextSlot();
    await apiRequest(app)
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

    await apiRequest(app)
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
    await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'A', ...slotA })
      .expect(201);

    const slotB = nextSlot(); // a fully separate hour — no overlap
    await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'B', ...slotB })
      .expect(201);
  });

  it('accepts an overlapping-time Booking on a different Room', async () => {
    const slot = nextSlot();
    await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'Room A booking', ...slot })
      .expect(201);

    await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: approvalRoomId, title: 'Room B booking', ...slot })
      .expect(201);
  });

  it('a PENDING_APPROVAL Booking still blocks a conflicting request on the same Room', async () => {
    const slot = nextSlot();
    const pending = await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: approvalRoomId, title: 'Pending first', ...slot })
      .expect(201);
    expect((pending.body as BookingResponse).status).toBe('PENDING_APPROVAL');

    await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({ roomId: approvalRoomId, title: 'Should conflict', ...slot })
      .expect(409);
  });

  describe('Booking deletion (#19)', () => {
    it('the owner can delete their own future already-CANCELLED Booking, and it disappears from the listing', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'To delete', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;

      // Simulates a Booking that reached CANCELLED status via historical
      // data (no live action produces this status anymore) — deletion must
      // still work regardless of the Booking's current status.
      await prisma.booking.update({
        where: { id: createdBody.id },
        data: { status: 'CANCELLED' },
      });

      await apiRequest(app)
        .delete(`/bookings/${createdBody.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(204);

      const listing = await apiRequest(app)
        .get('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      const ids = (listing.body as BookingResponse[]).map((b) => b.id);
      expect(ids).not.toContain(createdBody.id);
    });

    it('the owner can delete a still-active (CONFIRMED) future Booking, releasing its slot', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Delete while confirmed', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;
      expect(createdBody.status).toBe('CONFIRMED');

      await apiRequest(app)
        .delete(`/bookings/${createdBody.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(204);

      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ roomId: openRoomId, title: 'Takes the freed slot', ...slot })
        .expect(201);
    });

    it('an ADMIN can delete a future Booking that belongs to someone else', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Admin deletes this', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;

      await apiRequest(app)
        .delete(`/bookings/${createdBody.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('rejects deleting a future Booking that belongs to someone else', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Not yours to delete', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;

      await apiRequest(app)
        .delete(`/bookings/${createdBody.id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(403);
    });

    it('rejects deleting a future Booking as a FACILITY_MANAGER who does not own it', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Manager cannot delete', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;

      await apiRequest(app)
        .delete(`/bookings/${createdBody.id}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(403);
    });

    it('rejects deleting a past Booking', async () => {
      const past = await prisma.booking.create({
        data: {
          roomId: openRoomId,
          userId,
          title: 'Already happened',
          startTime: new Date('2020-01-01T00:00:00.000Z'),
          endTime: new Date('2020-01-01T01:00:00.000Z'),
          status: 'CANCELLED',
        },
      });

      await apiRequest(app)
        .delete(`/bookings/${past.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects deleting a Booking that is currently in progress', async () => {
      const inProgress = await prisma.booking.create({
        data: {
          roomId: openRoomId,
          userId,
          title: 'Happening right now',
          startTime: new Date(Date.now() - 30 * 60 * 1000),
          endTime: new Date(Date.now() + 30 * 60 * 1000),
          status: 'CONFIRMED',
        },
      });

      await apiRequest(app)
        .delete(`/bookings/${inProgress.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('404s deleting a Booking that was already deleted', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Delete twice', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;

      await apiRequest(app)
        .delete(`/bookings/${createdBody.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(204);

      await apiRequest(app)
        .delete(`/bookings/${createdBody.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });

    it('two racing remove() calls on the same Booking result in exactly one success and one already-deleted rejection', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Delete race', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;

      // The loser's exact status depends on where in remove() it loses the
      // race, and that's inherently timing-dependent, not a defect:
      // - if its own findUnique reads after the winner's updateMany already
      //   committed, remove() 404s before ever attempting a write;
      // - if both findUniques read before either write commits, the loser's
      //   own `where: { deletedAt: null }` updateMany matches zero rows and
      //   remove() 409s instead.
      // Either way the atomic updateMany guard (see bookings.service.ts)
      // guarantees exactly one of the two ever soft-deletes the Booking —
      // that invariant, not the exact status code, is what this test checks.
      const [firstRes, secondRes] = await Promise.all([
        apiRequest(app)
          .delete(`/bookings/${createdBody.id}`)
          .set('Authorization', `Bearer ${userToken}`),
        apiRequest(app)
          .delete(`/bookings/${createdBody.id}`)
          .set('Authorization', `Bearer ${userToken}`),
      ]);

      const statuses = [firstRes.status, secondRes.status].sort();
      expect(statuses).toEqual(expect.arrayContaining([204]));
      expect(statuses).not.toEqual([204, 204]);
      const [, loserStatus] = statuses;
      expect([404, 409]).toContain(loserStatus);
    });

    it('404s deleting a Booking that does not exist', () => {
      return apiRequest(app)
        .delete('/bookings/not-a-real-booking')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });

  describe('Booking editing (#25)', () => {
    it('the owner can edit title/description without touching status or the slot', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'Original title', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;
      expect((created.body as BookingResponse).status).toBe('PENDING_APPROVAL');

      const res = await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Updated title', description: 'More detail' })
        .expect(200);

      const body = res.body as BookingResponse;
      expect(body.title).toBe('Updated title');
      expect(body.status).toBe('PENDING_APPROVAL');
    });

    it('editing a CONFIRMED Booking to a Room requiring approval reverts it to PENDING_APPROVAL', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Edit to approval room', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;
      expect((created.body as BookingResponse).status).toBe('CONFIRMED');

      const res = await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId })
        .expect(200);

      expect((res.body as BookingResponse).status).toBe('PENDING_APPROVAL');
    });

    it('editing a PENDING_APPROVAL Booking to a Room that does not require approval confirms it immediately', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'Edit to open room', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;
      expect((created.body as BookingResponse).status).toBe('PENDING_APPROVAL');

      const res = await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId })
        .expect(200);

      expect((res.body as BookingResponse).status).toBe('CONFIRMED');
    });

    it('editing a Booking to a slightly different time on the same Room does not conflict with itself', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Self edit', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      // Shift only the start forward, keeping the original endTime — stays
      // fully inside nextSlot()'s 1-hour window (no spillover into the next
      // test's slot), while still genuinely changing the time range.
      const newStart = new Date(
        new Date(slot.startTime).getTime() + 15 * 60 * 1000,
      ).toISOString();

      await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ startTime: newStart })
        .expect(200);
    });

    it('rejects editing a Booking to a time that conflicts with another Booking on the same Room', async () => {
      const slotA = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'To move', ...slotA })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      const slotB = nextSlot();
      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ roomId: openRoomId, title: 'Occupies slot B', ...slotB })
        .expect(201);

      await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ startTime: slotB.startTime, endTime: slotB.endTime })
        .expect(409);
    });

    it('rejects editing a Booking that is currently in progress', async () => {
      const inProgress = await prisma.booking.create({
        data: {
          roomId: openRoomId,
          userId,
          title: 'Happening right now',
          startTime: new Date(Date.now() - 30 * 60 * 1000),
          endTime: new Date(Date.now() + 30 * 60 * 1000),
          status: 'CONFIRMED',
        },
      });

      await apiRequest(app)
        .patch(`/bookings/${inProgress.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Nope' })
        .expect(400);
    });

    it('rejects editing a past Booking', async () => {
      const past = await prisma.booking.create({
        data: {
          roomId: openRoomId,
          userId,
          title: 'Already happened',
          startTime: new Date('2020-01-01T00:00:00.000Z'),
          endTime: new Date('2020-01-01T01:00:00.000Z'),
          status: 'CONFIRMED',
        },
      });

      await apiRequest(app)
        .patch(`/bookings/${past.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Nope' })
        .expect(400);
    });

    it('rejects editing a REJECTED Booking', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'To reject then edit', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;
      await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);

      await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Nope' })
        .expect(400);
    });

    it('rejects editing a CANCELLED Booking (historical status)', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Historical cancel', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;
      await prisma.booking.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Nope' })
        .expect(400);
    });

    it('rejects editing a Booking that belongs to someone else', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Not yours to edit', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ title: 'Hijacked' })
        .expect(403);
    });

    it('an ADMIN can edit a future Booking that belongs to someone else', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Admin edits this', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      const res = await apiRequest(app)
        .patch(`/bookings/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Fixed by admin' })
        .expect(200);

      expect((res.body as BookingResponse).title).toBe('Fixed by admin');
    });

    it('an edit that reschedules racing a concurrent reject never resurrects a REJECTED Booking', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          roomId: approvalRoomId,
          title: 'Edit-reschedule vs reject race',
          ...slot,
        })
        .expect(201);
      const id = (created.body as BookingResponse).id;
      expect((created.body as BookingResponse).status).toBe('PENDING_APPROVAL');

      const [editRes, rejectRes] = await Promise.all([
        apiRequest(app)
          .patch(`/bookings/${id}`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({ roomId: openRoomId }),
        apiRequest(app)
          .patch(`/bookings/${id}/reject`)
          .set('Authorization', `Bearer ${facilityManagerToken}`),
      ]);

      // Both writes are guarded on the PENDING_APPROVAL status read before
      // either committed — only the first to commit can win.
      const statuses = [editRes.status, rejectRes.status].sort();
      expect(statuses).toEqual([200, 409]);
      const final = await prisma.booking.findUniqueOrThrow({ where: { id } });
      if (editRes.status === 200) {
        expect(final.status).toBe('CONFIRMED');
        expect(final.roomId).toBe(openRoomId);
      } else {
        expect(rejectRes.status).toBe(200);
        expect(final.status).toBe('REJECTED');
      }
    });

    it('404s editing a Booking that does not exist', () => {
      return apiRequest(app)
        .patch('/bookings/not-a-real-booking')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Ghost' })
        .expect(404);
    });
  });

  it('rejects creating a Booking where endTime is not after startTime', () => {
    const slot = nextSlot();
    return apiRequest(app)
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

  it('rejects a Booking whose startTime is in the past', () => {
    const start = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    return apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        roomId: openRoomId,
        title: 'Backdated',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      })
      .expect(400);
  });

  it('rejects a Booking longer than 24 hours', () => {
    // A fixed date well outside the nextSlot() cursor's range (2030-01-01
    // plus a handful of hours), so this multi-day span can't collide with
    // any other test's Booking on this shared Room.
    const start = new Date('2031-06-01T00:00:00.000Z');
    const end = new Date(start.getTime() + 25 * 60 * 60 * 1000);
    return apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        roomId: openRoomId,
        title: 'Room-locking',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      })
      .expect(400);
  });

  it('accepts a Booking of exactly 24 hours', async () => {
    const start = new Date('2031-07-01T00:00:00.000Z');
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        roomId: openRoomId,
        title: 'Exactly one day',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      })
      .expect(201);
  });

  it('rejects creating a Booking for a Room that does not exist', () => {
    const slot = nextSlot();
    return apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: 'not-a-real-room', title: 'Ghost room', ...slot })
      .expect(404);
  });

  it('the creating User owns the Booking', async () => {
    const slot = nextSlot();
    const created = await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'Ownership check', ...slot })
      .expect(201);
    expect((created.body as BookingResponse).userId).toBe(userId);
  });

  describe('Booking Approval', () => {
    async function createPending(): Promise<string> {
      const slot = nextSlot();
      const res = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'Needs approval', ...slot })
        .expect(201);
      const body = res.body as BookingResponse;
      expect(body.status).toBe('PENDING_APPROVAL');
      return body.id;
    }

    it('FACILITY_MANAGER can approve a PENDING_APPROVAL Booking, setting it CONFIRMED', async () => {
      const id = await createPending();
      const res = await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      expect((res.body as BookingResponse).status).toBe('CONFIRMED');
    });

    it('FACILITY_MANAGER can reject a PENDING_APPROVAL Booking, releasing its slot', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'To reject', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      const res = await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      expect((res.body as BookingResponse).status).toBe('REJECTED');

      // The slot is free again for a new request.
      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          roomId: approvalRoomId,
          title: 'Takes the freed slot',
          ...slot,
        })
        .expect(201);
    });

    it('rejects approval by a User who is not FACILITY_MANAGER or ADMIN', async () => {
      const id = await createPending();
      await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('rejects rejection by a User who is not FACILITY_MANAGER or ADMIN', async () => {
      const id = await createPending();
      await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('ADMIN can also approve a PENDING_APPROVAL Booking', async () => {
      const id = await createPending();
      const res = await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((res.body as BookingResponse).status).toBe('CONFIRMED');
    });

    it('rejects deciding a Booking that is not PENDING_APPROVAL', async () => {
      const id = await createPending();
      await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);

      // Already CONFIRMED — a second decision is rejected, not silently reapplied.
      await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(409);
    });

    it('a remove racing an approve on the same Booking always soft-deletes it, and approve only wins if it committed first', async () => {
      const id = await createPending();

      const [removeRes, approveRes] = await Promise.all([
        apiRequest(app)
          .delete(`/bookings/${id}`)
          .set('Authorization', `Bearer ${userToken}`),
        apiRequest(app)
          .patch(`/bookings/${id}/approve`)
          .set('Authorization', `Bearer ${facilityManagerToken}`),
      ]);

      // remove()'s guard is only on deletedAt (not status), so unlike two
      // writers racing on the same field, remove() always succeeds here —
      // approve() only succeeds if it commits before remove() sets
      // deletedAt, since decide()'s guard requires deletedAt: null. The
      // invariant: a Booking is never left CONFIRMED with deletedAt still
      // null after both calls settle, and approve is never silently
      // resurrected once removed.
      expect(removeRes.status).toBe(204);
      const final = await prisma.booking.findUniqueOrThrow({ where: { id } });
      expect(final.deletedAt).not.toBeNull();
      if (approveRes.status === 200) {
        expect(final.status).toBe('CONFIRMED');
      } else {
        expect(approveRes.status).toBe(409);
        expect(final.status).toBe('PENDING_APPROVAL');
      }
    });

    it('two racing approve calls on the same Booking result in exactly one success', async () => {
      const id = await createPending();

      const [firstRes, secondRes] = await Promise.all([
        apiRequest(app)
          .patch(`/bookings/${id}/approve`)
          .set('Authorization', `Bearer ${facilityManagerToken}`),
        apiRequest(app)
          .patch(`/bookings/${id}/approve`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);

      const statuses = [firstRes.status, secondRes.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });

  describe('Booking Revert', () => {
    async function createPending(): Promise<string> {
      const slot = nextSlot();
      const res = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'Needs approval', ...slot })
        .expect(201);
      const body = res.body as BookingResponse;
      expect(body.status).toBe('PENDING_APPROVAL');
      return body.id;
    }

    async function createDecided(
      outcome: 'approve' | 'reject',
    ): Promise<{ id: string; slot: { startTime: string; endTime: string } }> {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: `To ${outcome}`, ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;
      await apiRequest(app)
        .patch(`/bookings/${id}/${outcome}`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      return { id, slot };
    }

    it('FACILITY_MANAGER can revert a CONFIRMED (approved) Booking back to PENDING_APPROVAL', async () => {
      const { id } = await createDecided('approve');
      const res = await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      expect((res.body as BookingResponse).status).toBe('PENDING_APPROVAL');
    });

    it('FACILITY_MANAGER can revert a REJECTED Booking back to PENDING_APPROVAL', async () => {
      const { id } = await createDecided('reject');
      const res = await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      expect((res.body as BookingResponse).status).toBe('PENDING_APPROVAL');
    });

    it('ADMIN can also revert a decided Booking', async () => {
      const { id } = await createDecided('approve');
      const res = await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((res.body as BookingResponse).status).toBe('PENDING_APPROVAL');
    });

    it('rejects revert by a User who is not FACILITY_MANAGER or ADMIN', async () => {
      const { id } = await createDecided('approve');
      await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('rejects reverting a Booking that was never reviewed (auto-CONFIRMED on a non-approval Room)', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Never reviewed', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;
      expect((created.body as BookingResponse).status).toBe('CONFIRMED');

      await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(409);
    });

    it('rejects reverting a Booking that is still PENDING_APPROVAL', async () => {
      const id = await createPending();
      await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(409);
    });

    it('blocks reverting a REJECTED Booking whose slot was taken by another Booking in the meantime', async () => {
      const { id, slot } = await createDecided('reject');
      // REJECTED doesn't hold the slot, so someone else can book it in the
      // meantime — see ACTIVE_BOOKING_STATUSES.
      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          roomId: approvalRoomId,
          title: 'Took the freed slot',
          ...slot,
        })
        .expect(201);

      await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(409);
    });

    it('reverting to PENDING_APPROVAL clears the review trail so it can be decided again', async () => {
      const { id } = await createDecided('approve');
      await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      const res = await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((res.body as BookingResponse).status).toBe('REJECTED');
    });
  });

  describe('Booking Approval History', () => {
    it('rejects unauthenticated requests', () => {
      return apiRequest(app).get('/bookings/approval-history').expect(401);
    });

    it('rejects a User who is not FACILITY_MANAGER or ADMIN', () => {
      return apiRequest(app)
        .get('/bookings/approval-history')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('FACILITY_MANAGER can list approve/reject/revert entries, newest first, with no other Audit Action types mixed in', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'History test', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      await apiRequest(app)
        .patch(`/bookings/${id}/revert`)
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const res = await apiRequest(app)
        .get('/bookings/approval-history')
        .set('Authorization', `Bearer ${facilityManagerToken}`)
        .expect(200);
      const body = res.body as Array<{
        action: string;
        targetType: string;
        targetId: string;
        detail: string | null;
        createdAt: string;
      }>;
      expect(
        body.every((e) => ['BOOKING_APPROVAL', 'BOOKING_REVERT'].includes(e.action)),
      ).toBe(true);
      expect(body.every((e) => e.targetType === 'Booking')).toBe(true);

      const forThisBooking = body.filter((e) => e.targetId === id);
      expect(forThisBooking.map((e) => e.detail)).toEqual([
        '拒絕',
        '復原（原為已核准）',
        '核准',
      ]);
      const timestamps = forThisBooking.map((e) =>
        new Date(e.createdAt).getTime(),
      );
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    });

    it('ADMIN can also list Booking approval-history entries', () => {
      return apiRequest(app)
        .get('/bookings/approval-history')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Active Booking cap', () => {
    it('rejects creating a Booking once the caller already holds the maximum number of active Bookings', async () => {
      const capped = await tokenFor('capped-booker@school.edu.tw');
      const capRoom = await prisma.room.create({
        data: {
          name: 'Cap Test Room',
          location: '1F',
          capacity: 4,
          equipment: [],
          requiresApproval: false,
        },
      });

      // Seed the cap directly via Prisma rather than 200 sequential HTTP
      // round-trips — the cap-boundary behavior under test is BookingsService
      // reading this count, not how the rows got there.
      const CAP = 200;
      const seedStart = new Date('2032-01-01T00:00:00.000Z');
      await prisma.booking.createMany({
        data: Array.from({ length: CAP }, (_, i) => ({
          roomId: capRoom.id,
          userId: capped.userId,
          title: `Cap fill ${i}`,
          startTime: new Date(seedStart.getTime() + i * 60 * 60 * 1000),
          endTime: new Date(
            seedStart.getTime() + i * 60 * 60 * 1000 + 30 * 60 * 1000,
          ),
          status: 'CONFIRMED',
        })),
      });
      const lastId = (
        await prisma.booking.findFirstOrThrow({
          where: { userId: capped.userId, title: `Cap fill ${CAP - 1}` },
        })
      ).id;

      const overflowSlot = {
        startTime: new Date(
          seedStart.getTime() + CAP * 60 * 60 * 1000,
        ).toISOString(),
        endTime: new Date(
          seedStart.getTime() + CAP * 60 * 60 * 1000 + 30 * 60 * 1000,
        ).toISOString(),
      };
      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${capped.token}`)
        .send({ roomId: capRoom.id, title: 'Over the cap', ...overflowSlot })
        .expect(400);

      // Freeing one active Booking allows a new one to be created again.
      await apiRequest(app)
        .delete(`/bookings/${lastId}`)
        .set('Authorization', `Bearer ${capped.token}`)
        .expect(204);

      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${capped.token}`)
        .send({
          roomId: capRoom.id,
          title: 'Back under the cap',
          ...overflowSlot,
        })
        .expect(201);
    });
  });
});

// A fresh app instance per test, each with its own in-memory
// ThrottlerStorage, so one test's requests never count toward another
// test's budget — and with the real ThrottlerGuard (not stubbed out, as it
// is for every other test in this file), so the actual creation-endpoint
// rate limit can be exercised directly.
describe('Booking rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let prisma: PrismaService;
  let token: string;
  let roomId: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setApiPrefix(app);
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    const { user } = await authService.loginWithGoogle({
      googleSub: 'sub-throttle-booker@school.edu.tw',
      email: 'throttle-booker@school.edu.tw',
      name: 'throttle-booker@school.edu.tw',
      hostedDomain: 'school.edu.tw',
    });
    const code = authService.createLoginCode(user.id);
    ({ accessToken: token } = await authService.exchangeLoginCode(code));

    const room = await prisma.room.create({
      data: {
        name: 'Throttle Test Room',
        location: '1F',
        capacity: 4,
        equipment: [],
        requiresApproval: false,
      },
    });
    roomId = room.id;
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('rejects a POST /bookings burst past the configured limit with 429', async () => {
    let sawThrottled = false;
    for (let i = 0; i < 30; i++) {
      const start = new Date(Date.UTC(2031, 0, 1, i, 0, 0));
      const end = new Date(Date.UTC(2031, 0, 1, i, 30, 0));
      const res = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId,
          title: `Throttle burst ${i}`,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });
      if (res.status === 429) {
        sawThrottled = true;
        break;
      }
      expect(res.status).toBe(201);
    }
    expect(sawThrottled).toBe(true);
  });
});
