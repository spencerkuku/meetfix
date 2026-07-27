import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { GoogleProfile } from './../src/auth/google-profile.interface';

// The full browser-redirect OAuth handshake can't be exercised without real
// Google credentials, so this seam is adapted: AuthService.loginWithGoogle
// (the domain check + provisioning logic that runs once Passport has
// already validated a Google profile) is exercised directly against a real
// Postgres, same as every other HTTP-boundary test in this repo. The
// redirect-kickoff endpoint (GET /auth/google) and the login-code exchange
// (GET /auth/me's actual token source) are still tested over real HTTP,
// since neither needs a live Google call.
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let prisma: PrismaService;

  const schoolProfile = (
    overrides: Partial<GoogleProfile> = {},
  ): GoogleProfile => ({
    googleSub: 'google-sub-1',
    email: 'teacher@school.edu.tw',
    name: '陳老師',
    hostedDomain: 'school.edu.tw',
    refreshToken: 'refresh-token-1',
    ...overrides,
  });

  // Mints a real session token the same way the browser would, via the
  // one-time login-code exchange (not by calling AuthService directly),
  // so tests exercising /auth/me go through the real HTTP-boundary seam.
  async function issueSessionToken(profile = schoolProfile()): Promise<{
    userId: string;
    accessToken: string;
  }> {
    const { user } = await authService.loginWithGoogle(profile);
    const code = authService.createLoginCode(user.id);
    const res = await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code })
      .expect(201);
    const body = res.body as { accessToken: string };
    return { userId: user.id, accessToken: body.accessToken };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    authService = moduleFixture.get(AuthService);
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  afterEach(async () => {
    await prisma.auditLogEntry.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a Google account outside the school Workspace domain', async () => {
    await expect(
      authService.loginWithGoogle(schoolProfile({ hostedDomain: 'gmail.com' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const userCount = await prisma.user.count();
    expect(userCount).toBe(0);
  });

  it('provisions a new User + Account with Role USER on first login, and encrypts the refresh token at rest', async () => {
    const { user } = await authService.loginWithGoogle(schoolProfile());

    expect(user.role).toBe('USER');
    expect(user.email).toBe('teacher@school.edu.tw');

    const account = await prisma.account.findUnique({
      where: { userId: user.id },
    });
    expect(account?.provider).toBe('GOOGLE');
    expect(account?.googleSub).toBe('google-sub-1');
    // The raw refresh token from Google must never be stored verbatim.
    expect(account?.googleRefreshToken).not.toBe('refresh-token-1');
    expect(account?.googleRefreshToken).toEqual(expect.any(String));
  });

  it('reuses the existing Account on a repeat login instead of creating a duplicate', async () => {
    const first = await authService.loginWithGoogle(schoolProfile());
    const second = await authService.loginWithGoogle(
      schoolProfile({ name: '陳老師（更新）' }),
    );

    expect(second.user.id).toBe(first.user.id);
    expect(second.user.name).toBe('陳老師（更新）');

    const accountCount = await prisma.account.count();
    expect(accountCount).toBe(1);
  });

  it('GET /auth/me rejects requests with no token', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me returns the current user for a valid session token', async () => {
    const { userId, accessToken } = await issueSessionToken();

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: userId,
      email: 'teacher@school.edu.tw',
      role: 'USER',
    });
  });

  it('POST /auth/exchange rejects a login code that has already been used', async () => {
    const { user } = await authService.loginWithGoogle(schoolProfile());
    const code = authService.createLoginCode(user.id);

    await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code })
      .expect(401);
  });

  it('POST /auth/exchange rejects an unknown login code', () => {
    return request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code: 'not-a-real-code' })
      .expect(401);
  });

  it('GET /auth/google redirects to Google restricted to the school domain with the Calendar scope', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/google')
      .expect(302);

    const location = res.headers.location;
    expect(location).toContain('accounts.google.com');
    expect(location).toContain('hd=school.edu.tw');
    expect(location).toContain(
      encodeURIComponent('https://www.googleapis.com/auth/calendar.events'),
    );
  });

  describe('Google account linking', () => {
    // Extracts the `state` query param from the URL returned by
    // GET /auth/google/link, so tests can feed it straight into
    // AuthService.linkGoogleAccount — the same seam adaptation as
    // loginWithGoogle above: the browser-redirect handshake with the real
    // Google authorization server can't be exercised in this suite, so the
    // post-passport linking logic is tested directly.
    function extractState(url: string): string {
      const state = new URL(url).searchParams.get('state');
      if (!state) throw new Error('state missing from Google link URL');
      return state;
    }

    async function registerAndLoginPasswordUser(
      email = 'dual@school.edu.tw',
    ): Promise<{ userId: string; accessToken: string }> {
      await prisma.autoApprovedDomain.upsert({
        where: { domain: 'school.edu.tw' },
        create: { domain: 'school.edu.tw' },
        update: {},
      });
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, name: '雙重帳號使用者', password: 'password123' })
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);
      const { accessToken } = login.body as { accessToken: string };
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { userId: user.id, accessToken };
    }

    afterEach(async () => {
      await prisma.autoApprovedDomain.deleteMany({});
    });

    it('GET /auth/google/link rejects requests with no session', () => {
      return request(app.getHttpServer()).get('/auth/google/link').expect(401);
    });

    it('GET /auth/google/link returns a Google authorization URL scoped to the school domain and Calendar, carrying a state for the current user', async () => {
      const { accessToken } = await registerAndLoginPasswordUser();

      const res = await request(app.getHttpServer())
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const { url } = res.body as { url: string };
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('hd=school.edu.tw');
      expect(url).toContain(
        encodeURIComponent('https://www.googleapis.com/auth/calendar.events'),
      );
      expect(new URL(url).searchParams.get('state')).toEqual(expect.any(String));
    });

    it('links a Google identity onto an existing password Account without touching its password credential', async () => {
      const { userId, accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await request(app.getHttpServer())
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const state = extractState((linkRes.body as { url: string }).url);

      await authService.linkGoogleAccount(
        state,
        schoolProfile({ email: 'dual@school.edu.tw', googleSub: 'google-sub-link-1' }),
      );

      const account = await prisma.account.findUnique({ where: { userId } });
      expect(account?.provider).toBe('PASSWORD');
      expect(account?.passwordHash).toEqual(expect.any(String));
      expect(account?.googleSub).toBe('google-sub-link-1');
      expect(account?.googleRefreshToken).not.toBe('refresh-token-1');
      expect(account?.googleRefreshToken).toEqual(expect.any(String));
    });

    it('makes a Google login work afterwards, resolving to the same User', async () => {
      const { userId, accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await request(app.getHttpServer())
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const state = extractState((linkRes.body as { url: string }).url);
      await authService.linkGoogleAccount(
        state,
        schoolProfile({ email: 'dual@school.edu.tw', googleSub: 'google-sub-link-2' }),
      );

      const { user } = await authService.loginWithGoogle(
        schoolProfile({ email: 'dual@school.edu.tw', googleSub: 'google-sub-link-2' }),
      );
      expect(user.id).toBe(userId);

      const accountCount = await prisma.account.count();
      expect(accountCount).toBe(1);
    });

    it('rejects linking when the Google account email does not match the current account email', async () => {
      const { accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await request(app.getHttpServer())
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const state = extractState((linkRes.body as { url: string }).url);

      await expect(
        authService.linkGoogleAccount(
          state,
          schoolProfile({ email: 'someone-else@school.edu.tw' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects linking a Google identity that is already linked to a different User', async () => {
      const first = await registerAndLoginPasswordUser('dual-a@school.edu.tw');
      const firstLink = await request(app.getHttpServer())
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(200);
      await authService.linkGoogleAccount(
        extractState((firstLink.body as { url: string }).url),
        schoolProfile({ email: 'dual-a@school.edu.tw', googleSub: 'google-sub-shared' }),
      );

      const second = await registerAndLoginPasswordUser('dual-b@school.edu.tw');
      const secondLink = await request(app.getHttpServer())
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(200);

      await expect(
        authService.linkGoogleAccount(
          extractState((secondLink.body as { url: string }).url),
          schoolProfile({ email: 'dual-b@school.edu.tw', googleSub: 'google-sub-shared' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects linking a Google account outside the school Workspace domain', async () => {
      const { accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await request(app.getHttpServer())
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const state = extractState((linkRes.body as { url: string }).url);

      await expect(
        authService.linkGoogleAccount(
          state,
          schoolProfile({ email: 'dual@school.edu.tw', hostedDomain: 'gmail.com' }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a tampered or expired link state', async () => {
      await expect(
        authService.linkGoogleAccount('not-a-real-state', schoolProfile()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a Google login for an email that already has a password Account, pointing the user at profile linking instead', async () => {
      await registerAndLoginPasswordUser('dual-conflict@school.edu.tw');

      await expect(
        authService.loginWithGoogle(
          schoolProfile({
            email: 'dual-conflict@school.edu.tw',
            googleSub: 'google-sub-conflict',
          }),
        ),
      ).rejects.toThrow(/link Google/);
    });
  });

  describe('Password accounts (ADR-0003)', () => {
    afterEach(async () => {
      await prisma.autoApprovedDomain.deleteMany({});
    });

    it('activates immediately when the email domain is on the Auto-Approved Domain list', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'vendor.example.com' },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'tech@vendor.example.com',
          name: '外包廠商',
          password: 'password123',
        })
        .expect(201);
      expect((res.body as { status: string }).status).toBe('ACTIVE');

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'tech@vendor.example.com', password: 'password123' })
        .expect(201);
      expect((login.body as { accessToken: string }).accessToken).toEqual(
        expect.any(String),
      );
    });

    it('lands PENDING when the email domain is not on the Auto-Approved Domain list', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'outsider@unknown.example.com',
          name: '外部人士',
          password: 'password123',
        })
        .expect(201);
      expect((res.body as { status: string }).status).toBe('PENDING');
    });

    it('rejects login for a PENDING account with a clear error, not a silent failure', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'pending@unknown.example.com',
          name: '待審核使用者',
          password: 'password123',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'pending@unknown.example.com', password: 'password123' })
        .expect(401);
      expect((res.body as { message: string }).message).toMatch(/pending/i);
    });

    it('rejects login with a wrong password', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'vendor.example.com' },
      });
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'tech2@vendor.example.com',
          name: '外包廠商二',
          password: 'password123',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'tech2@vendor.example.com', password: 'wrong-password' })
        .expect(401);
    });

    it('rejects registering a duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'dupe@unknown.example.com',
          name: '第一次',
          password: 'password123',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'dupe@unknown.example.com',
          name: '第二次',
          password: 'password123',
        })
        .expect(409);
    });

    it('rejects registration with a too-short password', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'shortpw@unknown.example.com',
          name: '短密碼',
          password: '123',
        })
        .expect(400);
    });
  });
});
