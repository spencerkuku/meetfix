import type { INestApplication } from '@nestjs/common';

// The API's single route-prefix namespace, applied by both main.ts and
// every e2e test that boots its own Nest application. Every controller
// route (and the /uploads static prefix — see uploads/serve-uploads.ts)
// lives under this so it never collides with the frontend SPA's own
// client-side routes of the same name (e.g. /rooms, /admin) once both are
// served from the same Caddy origin.
export const API_PREFIX = 'api';

export function setApiPrefix(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
}
