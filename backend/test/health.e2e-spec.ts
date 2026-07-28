import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { setApiPrefix } from './../src/bootstrap';
import { apiRequest } from './support/api-request';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setApiPrefix(app);
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  it('GET /health returns ok when the database is reachable', () => {
    return apiRequest(app).get('/health').expect(200).expect({ status: 'ok' });
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
