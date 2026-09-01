import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

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

// Caddy is the sole reverse-proxy hop in front of this API in every
// deployment (see docker-compose.yml / deploy/Caddyfile, ADR-0002) — the
// `api` container publishes no host ports, so Express never sees a real
// client's TCP connection directly, only Caddy's. Without this, Express's
// req.ip (and therefore @nestjs/throttler's default per-request tracker on
// /auth/login, /auth/register, /auth/password, /repairs, /bookings)
// resolves to Caddy's constant internal address for every request, turning
// the "N requests per 60s per client" rate limits into a single counter
// shared by the entire user base. Trusting exactly one hop restores
// per-client tracking by reading the real client address Caddy sets in
// X-Forwarded-For. Trusting more than one hop (e.g. `true`) would instead
// let a client-supplied X-Forwarded-For spoof its own rate-limit identity
// if the topology ever gained an additional hop — see the security audit
// finding this closes.
export function setTrustProxy(app: NestExpressApplication): void {
  app.set('trust proxy', 1);
}

// Clickjacking defense for the API's own responses. The primary fix lives
// at the Caddy edge (deploy/Caddyfile), since that's the layer serving the
// SPA's own pages — but nothing in this repo boots Caddy for automated
// testing, so this redundant NestJS-layer header (verifiable through the
// existing e2e HTTP test client) protects /api/* independently of Caddy.
// See the security audit finding this closes.
export function setSecurityHeaders(app: INestApplication): void {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
}
