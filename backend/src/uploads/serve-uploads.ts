import { join } from 'path';
import type { NestExpressApplication } from '@nestjs/platform-express';

// Shared by main.ts and any e2e test that boots its own Nest application,
// so both exercise the identical static-serving configuration (including the
// nosniff hardening header) rather than two configs drifting apart.
export function serveUploads(app: NestExpressApplication): void {
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });
}
