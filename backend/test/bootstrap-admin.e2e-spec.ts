import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { bootstrapAdmin } from './../src/bootstrap-admin';

// No HTTP endpoint exists for this — it's a startup/bootstrap script, not an
// API — so the highest available seam is calling the shared function
// directly against a real Postgres and asserting on the resulting User/
// Account rows, the same direct-Prisma-assertion style used throughout this
// repo's other e2e specs (e.g. admin.e2e-spec.ts, audit.e2e-spec.ts).
describe('bootstrapAdmin (e2e)', () => {
  let prisma: PrismaClient;
  const originalEnv = {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    name: process.env.SEED_ADMIN_NAME,
  };

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterEach(async () => {
    delete process.env.SEED_ADMIN_EMAIL;
    delete process.env.SEED_ADMIN_PASSWORD;
    delete process.env.SEED_ADMIN_NAME;
    await prisma.account.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    if (originalEnv.email) process.env.SEED_ADMIN_EMAIL = originalEnv.email;
    if (originalEnv.password)
      process.env.SEED_ADMIN_PASSWORD = originalEnv.password;
    if (originalEnv.name) process.env.SEED_ADMIN_NAME = originalEnv.name;
    await prisma.$disconnect();
  });

  it('creates exactly one ADMIN User with a matching PASSWORD/ACTIVE Account when no ADMIN exists', async () => {
    process.env.SEED_ADMIN_EMAIL = 'bootstrap-admin@school.edu.tw';
    process.env.SEED_ADMIN_PASSWORD = 'bootstrap-password-123';
    process.env.SEED_ADMIN_NAME = '種子管理員';

    await bootstrapAdmin(prisma);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'bootstrap-admin@school.edu.tw' },
      include: { account: true },
    });
    expect(user.role).toBe(Role.ADMIN);
    expect(user.name).toBe('種子管理員');
    expect(user.account?.provider).toBe('PASSWORD');
    expect(user.account?.status).toBe('ACTIVE');
    await expect(
      bcrypt.compare('bootstrap-password-123', user.account!.passwordHash!),
    ).resolves.toBe(true);

    const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
    expect(adminCount).toBe(1);
  });

  it('is a no-op when an ADMIN already exists, and does not touch its Account', async () => {
    const existingAdmin = await prisma.user.create({
      data: {
        email: 'existing-admin@school.edu.tw',
        name: '既有管理員',
        role: Role.ADMIN,
        account: {
          create: {
            provider: 'PASSWORD',
            status: 'ACTIVE',
            passwordHash: 'existing-hash-untouched',
          },
        },
      },
      include: { account: true },
    });

    process.env.SEED_ADMIN_EMAIL = 'bootstrap-admin@school.edu.tw';
    process.env.SEED_ADMIN_PASSWORD = 'bootstrap-password-123';

    await bootstrapAdmin(prisma);

    const userCount = await prisma.user.count();
    expect(userCount).toBe(1);
    const account = await prisma.account.findUnique({
      where: { userId: existingAdmin.id },
    });
    expect(account?.passwordHash).toBe('existing-hash-untouched');
    const notCreated = await prisma.user.findUnique({
      where: { email: 'bootstrap-admin@school.edu.tw' },
    });
    expect(notCreated).toBeNull();
  });

  it('is a no-op with no error when the env vars are absent', async () => {
    await expect(bootstrapAdmin(prisma)).resolves.toBeUndefined();
    const userCount = await prisma.user.count();
    expect(userCount).toBe(0);
  });
});
