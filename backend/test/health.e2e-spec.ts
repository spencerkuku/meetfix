import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { setApiPrefix, setSecurityHeaders } from './../src/bootstrap';
import { apiRequest } from './support/api-request';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setSecurityHeaders(app);
    setApiPrefix(app);
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  it('GET /health returns ok when the database is reachable', () => {
    return apiRequest(app).get('/health').expect(200).expect({ status: 'ok' });
  });

  // The Caddy edge carries the primary fix (it's the layer that serves the
  // SPA's own pages — see deploy/Caddyfile), but nothing in this repo boots
  // Caddy for automated testing. This is the redundant NestJS-layer half of
  // the fix, verifiable through the existing e2e HTTP test client.
  it('every response carries a frame-blocking header, defending /api/* independently of the Caddy edge', () => {
    return apiRequest(app)
      .get('/health')
      .expect(200)
      .expect('X-Frame-Options', 'DENY');
  });

  it('the database has actually had migrations applied to it, not just an empty connection', async () => {
    const applied = await prisma.$queryRaw<
      { migration_name: string }[]
    >`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    expect(applied.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await app.close();
  });
});
