// 建立/更新平台管理員帳號（PASSWORD 登入方式）。用於本機開發或首次部署時，
// 在還沒有任何 ADMIN 可以登入的情況下，先種一個管理員帳號進資料庫。
// 帳號密碼一律來自環境變數，不寫死在程式碼或版本控制中。
import {
  PrismaClient,
  AccountProvider,
  AccountStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// 與 auth.service.ts 的雜湊成本保持一致
const PASSWORD_HASH_ROUNDS = 10;

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? '系統管理員';

  if (!email || !password) {
    console.log(
      '未設定 SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD，略過平台管理員帳號 seed。',
    );
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { account: true },
  });
  if (existing?.account && existing.account.provider !== AccountProvider.PASSWORD) {
    console.log(
      `帳號 ${email} 已存在但登入方式為 ${existing.account.provider}，為避免覆蓋既有 Google 連結，略過此次 seed。`,
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

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
