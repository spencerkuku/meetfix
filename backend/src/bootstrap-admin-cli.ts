// Production entrypoint for bootstrap-admin (see docker-entrypoint.sh).
// Compiled to dist/ alongside the rest of the app by the normal build, so it
// runs with plain `node` — no ts-node or prisma CLI needed in the runtime
// image. Delegates all actual logic to bootstrap-admin.ts.
import { PrismaClient } from '@prisma/client';
import { bootstrapAdmin } from './bootstrap-admin';

const prisma = new PrismaClient();

bootstrapAdmin(prisma)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
