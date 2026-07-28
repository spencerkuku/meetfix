import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { NotificationsService } from './../src/notifications/notifications.service';
import { CalendarService } from './../src/calendar/calendar.service';
import { Role } from '@prisma/client';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';

interface BookingResponse {
  id: string;
  roomId: string;
  userId: string;
  status: 'CONFIRMED' | 'PENDING_APPROVAL' | 'REJECTED' | 'CANCELLED';
  startTime: string;
  endTime: string;
  googleEventId: string | null;
}

describe('Bookings (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let prisma: PrismaService;
  let userToken: string;
  let userId: string;
  let otherUserToken: string;
  let roomManagerToken: string;
  let adminToken: string;
  let maintenanceToken: string;
  let openRoomId: string;
  let approvalRoomId: string;
  // The wiring to NotificationsService is exercised for real here (mocked
  // only at the SMTP-send boundary) so we assert it fires with the right
  // decision outcome.
  const notifications = {
    notifyBookingSubmittedForApproval: jest.fn(),
    notifyBookingDecision: jest.fn(),
    notifyBookingCancelled: jest.fn(),
  };
  // Same rationale as `notifications` above.
  const calendar = {
    syncBookingConfirmed: jest.fn().mockResolvedValue(null),
    removeBookingEvent: jest.fn().mockResolvedValue(undefined),
  };

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
      .overrideProvider(NotificationsService)
      .useValue(notifications)
      .overrideProvider(CalendarService)
      .useValue(calendar)
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
    roomManagerToken = await tokenForRole(
      'manager@school.edu.tw',
      Role.ROOM_MANAGER,
    );
    adminToken = await tokenForRole('admin@school.edu.tw', Role.ADMIN);
    maintenanceToken = await tokenForRole(
      'maintenance@school.edu.tw',
      Role.MAINTENANCE,
    );

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

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('cancelling a Booking releases its slot for a new request', async () => {
    const slot = nextSlot();
    const created = await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'To cancel', ...slot })
      .expect(201);
    const createdBody = created.body as BookingResponse;

    await apiRequest(app)
      .patch(`/bookings/${createdBody.id}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({ roomId: openRoomId, title: 'Takes the freed slot', ...slot })
      .expect(201);
  });

  it('rejects cancelling a Booking that belongs to someone else', async () => {
    const slot = nextSlot();
    const created = await apiRequest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ roomId: openRoomId, title: 'Not yours', ...slot })
      .expect(201);
    const createdBody = created.body as BookingResponse;

    await apiRequest(app)
      .patch(`/bookings/${createdBody.id}/cancel`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .expect(403);
  });

  describe('Booking deletion (#19)', () => {
    it('the owner can delete their own future CANCELLED Booking, and it disappears from the listing', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'To delete', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;

      await apiRequest(app)
        .patch(`/bookings/${createdBody.id}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

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

    it('the owner can delete a still-active (CONFIRMED) future Booking without cancelling it first, releasing its slot', async () => {
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

    it('rejects deleting a future Booking as a ROOM_MANAGER who does not own it', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Manager cannot delete', ...slot })
        .expect(201);
      const createdBody = created.body as BookingResponse;

      await apiRequest(app)
        .delete(`/bookings/${createdBody.id}`)
        .set('Authorization', `Bearer ${roomManagerToken}`)
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

    it('404s deleting a Booking that does not exist', () => {
      return apiRequest(app)
        .delete('/bookings/not-a-real-booking')
        .set('Authorization', `Bearer ${userToken}`)
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

    it('ROOM_MANAGER can approve a PENDING_APPROVAL Booking, setting it CONFIRMED', async () => {
      const id = await createPending();
      const res = await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${roomManagerToken}`)
        .expect(200);
      expect((res.body as BookingResponse).status).toBe('CONFIRMED');
    });

    it('ROOM_MANAGER can reject a PENDING_APPROVAL Booking, releasing its slot', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'To reject', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      const res = await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${roomManagerToken}`)
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

    it('rejects approval by a User who is not ROOM_MANAGER or ADMIN', async () => {
      const id = await createPending();
      await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('rejects rejection by a User who is not ROOM_MANAGER or ADMIN', async () => {
      const id = await createPending();
      await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('rejects approval by a MAINTENANCE User', async () => {
      const id = await createPending();
      await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${maintenanceToken}`)
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
        .set('Authorization', `Bearer ${roomManagerToken}`)
        .expect(200);

      // Already CONFIRMED — a second decision is rejected, not silently reapplied.
      await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${roomManagerToken}`)
        .expect(409);
    });

    it('a cancel racing an approve on the same Booking never resurrects CANCELLED back to CONFIRMED', async () => {
      const id = await createPending();

      const [cancelRes, approveRes] = await Promise.all([
        apiRequest(app)
          .patch(`/bookings/${id}/cancel`)
          .set('Authorization', `Bearer ${userToken}`),
        apiRequest(app)
          .patch(`/bookings/${id}/approve`)
          .set('Authorization', `Bearer ${roomManagerToken}`),
      ]);

      // Whichever write commits first at the database wins; the loser must
      // be rejected outright (409), never silently overwritten. Both sides
      // returning 200 is only valid if cancel is the one that ran second
      // (cancelling an already-CONFIRMED Booking is legitimate) — the
      // invariant that must hold in every ordering is: a CANCELLED Booking
      // is never resurrected to CONFIRMED.
      const final = await prisma.booking.findUniqueOrThrow({ where: { id } });
      if (cancelRes.status === 200) {
        expect(final.status).toBe('CANCELLED');
      } else {
        expect(cancelRes.status).toBe(409);
        expect(approveRes.status).toBe(200);
        expect(final.status).toBe('CONFIRMED');
      }
    });

    it('two racing approve calls on the same Booking result in exactly one Calendar sync, never an orphaned duplicate', async () => {
      const id = await createPending();

      const [firstRes, secondRes] = await Promise.all([
        apiRequest(app)
          .patch(`/bookings/${id}/approve`)
          .set('Authorization', `Bearer ${roomManagerToken}`),
        apiRequest(app)
          .patch(`/bookings/${id}/approve`)
          .set('Authorization', `Bearer ${adminToken}`),
      ]);

      const statuses = [firstRes.status, secondRes.status].sort();
      expect(statuses).toEqual([200, 409]);
      expect(calendar.syncBookingConfirmed).toHaveBeenCalledTimes(1);
    });
  });

  describe('Notifications wiring (#10)', () => {
    it('notifies Room Manager(s) when a Booking is submitted for approval', async () => {
      const slot = nextSlot();
      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'Notify submit', ...slot })
        .expect(201);

      expect(
        notifications.notifyBookingSubmittedForApproval,
      ).toHaveBeenCalledTimes(1);
    });

    it('does not notify Room Manager(s) for an auto-confirmed Booking', async () => {
      const slot = nextSlot();
      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'No approval needed', ...slot })
        .expect(201);

      expect(
        notifications.notifyBookingSubmittedForApproval,
      ).not.toHaveBeenCalled();
    });

    it('notifies the requester of a Booking Approval decision', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'Notify decision', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${roomManagerToken}`)
        .expect(200);

      expect(notifications.notifyBookingDecision).toHaveBeenCalledTimes(1);
    });

    it('notifies the requester when someone else cancels their Booking', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Cancelled by admin', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      await apiRequest(app)
        .patch(`/bookings/${id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(notifications.notifyBookingCancelled).toHaveBeenCalledTimes(1);
    });

    it('still calls the cancel-notification hook when the requester cancels their own Booking (decision logic then suppresses it)', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Self-cancelled', ...slot })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      await apiRequest(app)
        .patch(`/bookings/${id}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(notifications.notifyBookingCancelled).toHaveBeenCalledTimes(1);
      const [, , , cancelledByUserId] = notifications.notifyBookingCancelled
        .mock.calls[0] as [unknown, unknown, unknown, string];
      expect(cancelledByUserId).toBe(userId);
    });
  });

  describe('Calendar sync wiring (#11)', () => {
    it('syncs an auto-confirmed Booking to Calendar and persists the returned event id', async () => {
      calendar.syncBookingConfirmed.mockResolvedValueOnce('evt-auto-confirm');
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: openRoomId, title: 'Calendar sync on create', ...slot })
        .expect(201);

      expect(calendar.syncBookingConfirmed).toHaveBeenCalledTimes(1);
      expect((created.body as BookingResponse).googleEventId).toBe(
        'evt-auto-confirm',
      );
    });

    it('does not attempt a Calendar sync for a PENDING_APPROVAL Booking', async () => {
      const slot = nextSlot();
      await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ roomId: approvalRoomId, title: 'No sync yet', ...slot })
        .expect(201);

      expect(calendar.syncBookingConfirmed).not.toHaveBeenCalled();
    });

    it('syncs to Calendar when a Booking is approved, persisting the returned event id', async () => {
      calendar.syncBookingConfirmed.mockResolvedValueOnce('evt-approved');
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          roomId: approvalRoomId,
          title: 'Calendar sync on approve',
          ...slot,
        })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      const approved = await apiRequest(app)
        .patch(`/bookings/${id}/approve`)
        .set('Authorization', `Bearer ${roomManagerToken}`)
        .expect(200);

      expect(calendar.syncBookingConfirmed).toHaveBeenCalledTimes(1);
      expect((approved.body as BookingResponse).googleEventId).toBe(
        'evt-approved',
      );
    });

    it('removes the Calendar event when a Booking is cancelled', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          roomId: openRoomId,
          title: 'Calendar removal on cancel',
          ...slot,
        })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      await apiRequest(app)
        .patch(`/bookings/${id}/cancel`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(calendar.removeBookingEvent).toHaveBeenCalledTimes(1);
    });

    it('calls the Calendar removal hook when a Booking is rejected (a no-op, since it was never synced)', async () => {
      const slot = nextSlot();
      const created = await apiRequest(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          roomId: approvalRoomId,
          title: 'Calendar removal on reject',
          ...slot,
        })
        .expect(201);
      const id = (created.body as BookingResponse).id;

      await apiRequest(app)
        .patch(`/bookings/${id}/reject`)
        .set('Authorization', `Bearer ${roomManagerToken}`)
        .expect(200);

      expect(calendar.removeBookingEvent).toHaveBeenCalledTimes(1);
    });
  });
});
