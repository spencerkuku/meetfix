import { Test, TestingModule } from '@nestjs/testing';
import {
  CanActivate,
  ConflictException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthService } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { GoogleProfile } from './../src/auth/google-profile.interface';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';

// Every test in this file but the dedicated "Rate limiting" block below
// calls /auth/login or /auth/register many times in quick succession — far
// more than the real 5-req/60s throttle allows. Stub the guard out for this
// shared app instance so those tests exercise their own concerns, not the
// throttle; the dedicated block below builds its own app instance with the
// real ThrottlerGuard to test throttling itself.
const permissiveThrottlerGuard: CanActivate = { canActivate: () => true };

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
    const res = await apiRequest(app)
      .post('/auth/exchange')
      .send({ code })
      .expect(201);
    const body = res.body as { accessToken: string };
    return { userId: user.id, accessToken: body.accessToken };
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
    ).rejects.toThrow('此 Google 帳號不屬於學校網域，無法登入');

    const userCount = await prisma.user.count();
    expect(userCount).toBe(0);
  });

  it('rejects login for a SUSPENDED Google-linked account before issuing a session', async () => {
    const { user } = await authService.loginWithGoogle(
      schoolProfile({ email: 'suspended-google@school.edu.tw', googleSub: 'google-sub-suspended' }),
    );
    await prisma.account.update({
      where: { userId: user.id },
      data: { status: 'SUSPENDED' },
    });

    await expect(
      authService.loginWithGoogle(
        schoolProfile({ email: 'suspended-google@school.edu.tw', googleSub: 'google-sub-suspended' }),
      ),
    ).rejects.toThrow('此帳號已被停權，請洽管理員');
  });

  it('accepts a Google account under a subdomain of the school Workspace domain', async () => {
    const { user } = await authService.loginWithGoogle(
      schoolProfile({
        email: 'student@stu.school.edu.tw',
        hostedDomain: 'stu.school.edu.tw',
      }),
    );

    expect(user.email).toBe('student@stu.school.edu.tw');
  });

  it('accepts a multi-level subdomain of the school Workspace domain', async () => {
    const { user } = await authService.loginWithGoogle(
      schoolProfile({
        email: 'student@dept.stu.school.edu.tw',
        hostedDomain: 'dept.stu.school.edu.tw',
      }),
    );

    expect(user.email).toBe('student@dept.stu.school.edu.tw');
  });

  it('never treats a lookalike domain as a subdomain of the school Workspace domain', async () => {
    await expect(
      authService.loginWithGoogle(
        schoolProfile({ hostedDomain: 'evilschool.edu.tw' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const userCount = await prisma.user.count();
    expect(userCount).toBe(0);
  });

  it('provisions a new User + Account with Role USER on first login', async () => {
    const { user } = await authService.loginWithGoogle(schoolProfile());

    expect(user.role).toBe('USER');
    expect(user.email).toBe('teacher@school.edu.tw');

    const account = await prisma.account.findUnique({
      where: { userId: user.id },
    });
    expect(account?.provider).toBe('GOOGLE');
    expect(account?.googleSub).toBe('google-sub-1');
  });

  it('stores the Google profile photo as avatarUrl on first login', async () => {
    const { user } = await authService.loginWithGoogle(
      schoolProfile({ avatarUrl: 'https://lh3.googleusercontent.com/photo-1' }),
    );

    expect(user.avatarUrl).toBe('https://lh3.googleusercontent.com/photo-1');
  });

  it('leaves avatarUrl null when the Google profile has no photo', async () => {
    const { user } = await authService.loginWithGoogle(
      schoolProfile({ avatarUrl: undefined }),
    );

    expect(user.avatarUrl).toBeNull();
  });

  it('refreshes avatarUrl to the latest photo on a repeat login', async () => {
    await authService.loginWithGoogle(
      schoolProfile({ avatarUrl: 'https://lh3.googleusercontent.com/old-photo' }),
    );
    const { user } = await authService.loginWithGoogle(
      schoolProfile({ avatarUrl: 'https://lh3.googleusercontent.com/new-photo' }),
    );

    expect(user.avatarUrl).toBe('https://lh3.googleusercontent.com/new-photo');
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
    return apiRequest(app).get('/auth/me').expect(401);
  });

  it('GET /auth/me returns the current user for a valid session token', async () => {
    const { userId, accessToken } = await issueSessionToken();

    const res = await apiRequest(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: userId,
      email: 'teacher@school.edu.tw',
      role: 'USER',
    });
  });

  it('rejects a session token immediately once its Account is suspended, without requiring a new login', async () => {
    const { userId, accessToken } = await issueSessionToken();
    await apiRequest(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await prisma.account.update({
      where: { userId },
      data: { status: 'SUSPENDED' },
    });

    await apiRequest(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('POST /auth/exchange rejects a login code that has already been used', async () => {
    const { user } = await authService.loginWithGoogle(schoolProfile());
    const code = authService.createLoginCode(user.id);

    await apiRequest(app).post('/auth/exchange').send({ code }).expect(201);

    await apiRequest(app).post('/auth/exchange').send({ code }).expect(401);
  });

  it('POST /auth/exchange rejects an unknown login code', () => {
    return apiRequest(app)
      .post('/auth/exchange')
      .send({ code: 'not-a-real-code' })
      .expect(401);
  });

  it('GET /auth/google redirects to Google restricted to the school domain', async () => {
    const res = await apiRequest(app).get('/auth/google').expect(302);

    const location = res.headers.location;
    expect(location).toContain('accounts.google.com');
    expect(location).toContain('hd=school.edu.tw');
    expect(location).not.toContain('access_type=offline');
    expect(location).not.toContain('prompt=consent');
    expect(location).not.toContain(
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
      await apiRequest(app)
        .post('/auth/register')
        .send({ email, name: '雙重帳號使用者', password: 'password123' })
        .expect(201);
      const login = await apiRequest(app)
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
      return apiRequest(app).get('/auth/google/link').expect(401);
    });

    it('GET /auth/google/link returns a Google authorization URL scoped to the school domain, carrying a state for the current user', async () => {
      const { accessToken } = await registerAndLoginPasswordUser();

      const res = await apiRequest(app)
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const { url } = res.body as { url: string };
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('hd=school.edu.tw');
      expect(url).not.toContain('access_type=offline');
      expect(url).not.toContain('prompt=consent');
      expect(url).not.toContain(
        encodeURIComponent('https://www.googleapis.com/auth/calendar.events'),
      );
      expect(new URL(url).searchParams.get('state')).toEqual(expect.any(String));
    });

    it('links a Google identity onto an existing password Account without touching its password credential', async () => {
      const { userId, accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await apiRequest(app)
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
    });

    it('populates avatarUrl from the linked Google profile', async () => {
      const { userId, accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await apiRequest(app)
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const state = extractState((linkRes.body as { url: string }).url);

      await authService.linkGoogleAccount(
        state,
        schoolProfile({
          email: 'dual@school.edu.tw',
          googleSub: 'google-sub-link-avatar',
          avatarUrl: 'https://lh3.googleusercontent.com/linked-photo',
        }),
      );

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.avatarUrl).toBe('https://lh3.googleusercontent.com/linked-photo');
    });

    it('overwrites a previously stored avatarUrl on a repeat link of the same Google identity', async () => {
      const { userId, accessToken } = await registerAndLoginPasswordUser(
        'dual-relink@school.edu.tw',
      );
      const firstLinkRes = await apiRequest(app)
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      await authService.linkGoogleAccount(
        extractState((firstLinkRes.body as { url: string }).url),
        schoolProfile({
          email: 'dual-relink@school.edu.tw',
          googleSub: 'google-sub-relink',
          avatarUrl: 'https://lh3.googleusercontent.com/old-linked-photo',
        }),
      );

      const secondLinkRes = await apiRequest(app)
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      await authService.linkGoogleAccount(
        extractState((secondLinkRes.body as { url: string }).url),
        schoolProfile({
          email: 'dual-relink@school.edu.tw',
          googleSub: 'google-sub-relink',
          avatarUrl: 'https://lh3.googleusercontent.com/new-linked-photo',
        }),
      );

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.avatarUrl).toBe('https://lh3.googleusercontent.com/new-linked-photo');
    });

    it('makes a Google login work afterwards, resolving to the same User', async () => {
      const { userId, accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await apiRequest(app)
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

    it('rejects the Google-link state token when replayed as a session Bearer token', async () => {
      const { accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await apiRequest(app)
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const state = extractState((linkRes.body as { url: string }).url);

      await apiRequest(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${state}`)
        .expect(401);
    });

    it('rejects linking when the Google account email does not match the current account email', async () => {
      const { accessToken } = await registerAndLoginPasswordUser();
      const linkRes = await apiRequest(app)
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
      const firstLink = await apiRequest(app)
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(200);
      await authService.linkGoogleAccount(
        extractState((firstLink.body as { url: string }).url),
        schoolProfile({ email: 'dual-a@school.edu.tw', googleSub: 'google-sub-shared' }),
      );

      const second = await registerAndLoginPasswordUser('dual-b@school.edu.tw');
      const secondLink = await apiRequest(app)
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
      const linkRes = await apiRequest(app)
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

    it('allows linking a Google account under a subdomain of the school Workspace domain', async () => {
      // Registration's own domain check is a separate code path (Auto-
      // Approved Domain) from the Google hd check under test here — give
      // this exact subdomain its own Auto-Approved entry so the password
      // Account this test links onto is ACTIVE and can log in.
      await prisma.autoApprovedDomain.upsert({
        where: { domain: 'stu.school.edu.tw' },
        create: { domain: 'stu.school.edu.tw' },
        update: {},
      });
      const { accessToken } = await registerAndLoginPasswordUser(
        'dual-subdomain@stu.school.edu.tw',
      );
      const linkRes = await apiRequest(app)
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const state = extractState((linkRes.body as { url: string }).url);

      await authService.linkGoogleAccount(
        state,
        schoolProfile({
          email: 'dual-subdomain@stu.school.edu.tw',
          hostedDomain: 'stu.school.edu.tw',
          googleSub: 'google-sub-link-subdomain',
        }),
      );

      const account = await prisma.account.findUnique({
        where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: 'dual-subdomain@stu.school.edu.tw' } })).id },
      });
      expect(account?.googleSub).toBe('google-sub-link-subdomain');
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

      const res = await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'tech@vendor.example.com',
          name: '外包廠商',
          password: 'password123',
        })
        .expect(201);
      expect((res.body as { status: string }).status).toBe('ACTIVE');

      const login = await apiRequest(app)
        .post('/auth/login')
        .send({ email: 'tech@vendor.example.com', password: 'password123' })
        .expect(201);
      expect((login.body as { accessToken: string }).accessToken).toEqual(
        expect.any(String),
      );
    });

    it('activates immediately for a subdomain when the matched entry has allowSubdomains: true', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'xxx.edu.tw', allowSubdomains: true },
      });

      const res = await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'staff@dept.xxx.edu.tw',
          name: '部門職員',
          password: 'password123',
        })
        .expect(201);
      expect((res.body as { status: string }).status).toBe('ACTIVE');
    });

    it('activates immediately for a multi-level subdomain when allowSubdomains: true', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'xxx.edu.tw', allowSubdomains: true },
      });

      const res = await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'staff@lab.cs.xxx.edu.tw',
          name: '實驗室職員',
          password: 'password123',
        })
        .expect(201);
      expect((res.body as { status: string }).status).toBe('ACTIVE');
    });

    it('lands PENDING for a subdomain when the matched entry has allowSubdomains: false', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'xxx.edu.tw', allowSubdomains: false },
      });

      const res = await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'staff@dept.xxx.edu.tw',
          name: '部門職員二',
          password: 'password123',
        })
        .expect(201);
      expect((res.body as { status: string }).status).toBe('PENDING');
    });

    it('never treats a lookalike domain as a subdomain match', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'xxx.edu.tw', allowSubdomains: true },
      });

      const res = await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'staff@evilxxx.edu.tw',
          name: '偽裝網域',
          password: 'password123',
        })
        .expect(201);
      expect((res.body as { status: string }).status).toBe('PENDING');
    });

    it('lands PENDING when the email domain is not on the Auto-Approved Domain list', async () => {
      const res = await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'outsider@unknown.example.com',
          name: '外部人士',
          password: 'password123',
        })
        .expect(201);
      expect((res.body as { status: string }).status).toBe('PENDING');
    });

    it('never sets avatarUrl for a password-only registration', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'no-avatar@unknown.example.com',
          name: '無頭貼使用者',
          password: 'password123',
        })
        .expect(201);

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'no-avatar@unknown.example.com' },
      });
      expect(user.avatarUrl).toBeNull();
    });

    it('rejects login for a PENDING account with a clear error, not a silent failure', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'pending@unknown.example.com',
          name: '待審核使用者',
          password: 'password123',
        })
        .expect(201);

      const res = await apiRequest(app)
        .post('/auth/login')
        .send({ email: 'pending@unknown.example.com', password: 'password123' })
        .expect(401);
      expect((res.body as { message: string }).message).toBe('此帳號尚待管理員審核');
    });

    it('rejects login for a SUSPENDED account with a distinct error from PENDING', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'suspended.example.com' },
      });
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'suspended-login@suspended.example.com',
          name: '已停權使用者',
          password: 'password123',
        })
        .expect(201);
      await prisma.account.update({
        where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email: 'suspended-login@suspended.example.com' } })).id },
        data: { status: 'SUSPENDED' },
      });

      const res = await apiRequest(app)
        .post('/auth/login')
        .send({ email: 'suspended-login@suspended.example.com', password: 'password123' })
        .expect(401);
      expect((res.body as { message: string }).message).toBe('此帳號已被停權，請洽管理員');
    });

    it('rejects login with a wrong password', async () => {
      await prisma.autoApprovedDomain.create({
        data: { domain: 'vendor.example.com' },
      });
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'tech2@vendor.example.com',
          name: '外包廠商二',
          password: 'password123',
        })
        .expect(201);

      await apiRequest(app)
        .post('/auth/login')
        .send({ email: 'tech2@vendor.example.com', password: 'wrong-password' })
        .expect(401);
    });

    it('rejects registering a duplicate email', async () => {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'dupe@unknown.example.com',
          name: '第一次',
          password: 'password123',
        })
        .expect(201);

      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'dupe@unknown.example.com',
          name: '第二次',
          password: 'password123',
        })
        .expect(409);
    });

    it('rejects registration with a too-short password', () => {
      return apiRequest(app)
        .post('/auth/register')
        .send({
          email: 'shortpw@unknown.example.com',
          name: '短密碼',
          password: '123',
        })
        .expect(400);
    });
  });

  describe('Change password (self-service)', () => {
    async function registerAndLoginPasswordUser(
      email = 'changepw@school.edu.tw',
      password = 'password123',
    ): Promise<{ userId: string; accessToken: string }> {
      await prisma.autoApprovedDomain.upsert({
        where: { domain: 'school.edu.tw' },
        create: { domain: 'school.edu.tw' },
        update: {},
      });
      await apiRequest(app)
        .post('/auth/register')
        .send({ email, name: '改密碼使用者', password })
        .expect(201);
      const login = await apiRequest(app)
        .post('/auth/login')
        .send({ email, password })
        .expect(201);
      const { accessToken } = login.body as { accessToken: string };
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { userId: user.id, accessToken };
    }

    afterEach(async () => {
      await prisma.autoApprovedDomain.deleteMany({});
    });

    it('changes the password given the correct current password, and the new password works on next login', async () => {
      const { accessToken } = await registerAndLoginPasswordUser(
        'changepw-success@school.edu.tw',
        'password123',
      );

      await apiRequest(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'password123', newPassword: 'newpassword456' })
        .expect(200);

      await apiRequest(app)
        .post('/auth/login')
        .send({
          email: 'changepw-success@school.edu.tw',
          password: 'newpassword456',
        })
        .expect(201);

      await apiRequest(app)
        .post('/auth/login')
        .send({
          email: 'changepw-success@school.edu.tw',
          password: 'password123',
        })
        .expect(401);
    });

    it('rejects with the wrong current password, and leaves the password unchanged', async () => {
      const { accessToken } = await registerAndLoginPasswordUser(
        'changepw-wrongcurrent@school.edu.tw',
        'password123',
      );

      await apiRequest(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'wrong-password', newPassword: 'newpassword456' })
        .expect(401);

      await apiRequest(app)
        .post('/auth/login')
        .send({
          email: 'changepw-wrongcurrent@school.edu.tw',
          password: 'password123',
        })
        .expect(201);
    });

    it('rejects a too-short new password', async () => {
      const { accessToken } = await registerAndLoginPasswordUser(
        'changepw-shortnew@school.edu.tw',
        'password123',
      );

      await apiRequest(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'password123', newPassword: '123' })
        .expect(400);
    });

    it('rejects an unauthenticated request', () => {
      return apiRequest(app)
        .patch('/auth/password')
        .send({ currentPassword: 'password123', newPassword: 'newpassword456' })
        .expect(401);
    });

    it('rejects a pure Google-only account with a clear error (no password to change)', async () => {
      const { accessToken } = await issueSessionToken();

      await apiRequest(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'anything', newPassword: 'newpassword456' })
        .expect(400);
    });

    it('still allows changing the password after linking Google onto a password Account', async () => {
      const { accessToken } = await registerAndLoginPasswordUser(
        'changepw-linked@school.edu.tw',
        'password123',
      );
      const linkRes = await apiRequest(app)
        .get('/auth/google/link')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const state = new URL((linkRes.body as { url: string }).url).searchParams.get(
        'state',
      );
      await authService.linkGoogleAccount(
        state!,
        schoolProfile({
          email: 'changepw-linked@school.edu.tw',
          googleSub: 'google-sub-changepw-linked',
        }),
      );

      await apiRequest(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'password123', newPassword: 'newpassword456' })
        .expect(200);

      await apiRequest(app)
        .post('/auth/login')
        .send({
          email: 'changepw-linked@school.edu.tw',
          password: 'newpassword456',
        })
        .expect(201);
    });
  });
});

// A fresh app instance per test, each with its own in-memory
// ThrottlerStorage, so one test's requests never count toward another
// test's budget — and with the real ThrottlerGuard (not stubbed out, as it
// is for every other test in this file), so the actual 5-req/60s limit on
// /auth/login and /auth/register can be exercised directly.
describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setApiPrefix(app);
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    await prisma.autoApprovedDomain.upsert({
      where: { domain: 'school.edu.tw' },
      create: { domain: 'school.edu.tw' },
      update: {},
    });
  });

  afterEach(async () => {
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
    await app.close();
  });

  it('rejects the 6th /auth/login attempt within 60s from the same source with 429', async () => {
    await apiRequest(app)
      .post('/auth/register')
      .send({
        email: 'throttle-login@school.edu.tw',
        name: '節流測試',
        password: 'password123',
      })
      .expect(201);

    for (let i = 0; i < 5; i++) {
      await apiRequest(app)
        .post('/auth/login')
        .send({ email: 'throttle-login@school.edu.tw', password: 'wrong' })
        .expect(401);
    }

    await apiRequest(app)
      .post('/auth/login')
      .send({ email: 'throttle-login@school.edu.tw', password: 'wrong' })
      .expect(429);
  });

  it('rejects the 6th /auth/register attempt within 60s from the same source with 429', async () => {
    for (let i = 0; i < 5; i++) {
      await apiRequest(app)
        .post('/auth/register')
        .send({
          email: `throttle-register-${i}@school.edu.tw`,
          name: '節流測試',
          password: 'password123',
        })
        .expect(201);
    }

    await apiRequest(app)
      .post('/auth/register')
      .send({
        email: 'throttle-register-overflow@school.edu.tw',
        name: '節流測試',
        password: 'password123',
      })
      .expect(429);
  });

  it('rejects the 6th /auth/password attempt within 60s from the same source with 429', async () => {
    await apiRequest(app)
      .post('/auth/register')
      .send({
        email: 'throttle-password@school.edu.tw',
        name: '節流測試',
        password: 'password123',
      })
      .expect(201);
    const login = await apiRequest(app)
      .post('/auth/login')
      .send({ email: 'throttle-password@school.edu.tw', password: 'password123' })
      .expect(201);
    const { accessToken } = login.body as { accessToken: string };

    for (let i = 0; i < 5; i++) {
      await apiRequest(app)
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'wrong', newPassword: 'newpassword456' })
        .expect(401);
    }

    await apiRequest(app)
      .patch('/auth/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'wrong', newPassword: 'newpassword456' })
      .expect(429);
  });
});
