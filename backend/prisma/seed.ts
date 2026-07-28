// Dev-time entrypoint (Prisma CLI convention: `npm run db:seed` /
// `npx prisma db seed`). Delegates to the shared bootstrap logic in
// src/bootstrap-admin.ts — see that file for the actual behavior. The
// production entrypoint (docker-entrypoint.sh) calls the same logic via the
// compiled src/bootstrap-admin-cli.ts instead of this ts-node-based script.
import { PrismaClient } from '@prisma/client';
import { bootstrapAdmin } from '../src/bootstrap-admin';

const prisma = new PrismaClient();

bootstrapAdmin(prisma)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
