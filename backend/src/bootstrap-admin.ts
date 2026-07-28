// Bootstraps the very first platform admin from SEED_ADMIN_EMAIL/
// SEED_ADMIN_PASSWORD/SEED_ADMIN_NAME env vars. Only fires when the system
// currently has no ADMIN-role User at all — safe to call unconditionally on
// every startup (dev-time `db:seed` or the production entrypoint), since
// once an admin exists this becomes a permanent no-op and can never reset a
// real admin's password back to the env value. See ADR/CONTEXT and the
// companion self-service change-password feature, which is how the
// bootstrapped admin is expected to move off this value.
import {
  PrismaClient,
  AccountProvider,
  AccountStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// 與 auth.service.ts 的雜湊成本保持一致
const PASSWORD_HASH_ROUNDS = 10;

export async function bootstrapAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? '系統管理員';

  if (!email || !password) {
    console.log(
      '未設定 SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD，略過平台管理員 bootstrap。',
    );
    return;
  }

  const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
  if (adminCount > 0) {
    console.log('系統已存在 ADMIN 帳號，略過平台管理員 bootstrap。');
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { account: true },
  });
  if (existing?.account && !existing.account.passwordHash) {
    console.log(
      `帳號 ${email} 已存在但沒有密碼登入方式（僅能用 Google 登入），為避免覆蓋，略過此次 bootstrap。`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: Role.ADMIN },
    create: { email, name, role: Role.ADMIN },
  });

  await prisma.account.upsert({
    where: { userId: user.id },
    update: {
      provider: AccountProvider.PASSWORD,
      status: AccountStatus.ACTIVE,
      passwordHash,
    },
    create: {
      userId: user.id,
      provider: AccountProvider.PASSWORD,
      status: AccountStatus.ACTIVE,
      passwordHash,
    },
  });

  console.log(`平台管理員帳號已就緒：${email}`);
}
