import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { API_PREFIX } from '../../src/bootstrap';

// Every route in this API lives under the shared API_PREFIX (see
// src/bootstrap.ts). Centralizing that here means e2e tests keep writing
// short, readable paths ('/rooms', not '/api/rooms'), and the prefix only
// has to change in one place if it ever does.
export function apiRequest(app: INestApplication<App>) {
  const agent = request(app.getHttpServer());
  const prefixed = (path: string) => `/${API_PREFIX}${path}`;
  return {
    get: (path: string) => agent.get(prefixed(path)),
    post: (path: string) => agent.post(prefixed(path)),
    put: (path: string) => agent.put(prefixed(path)),
    patch: (path: string) => agent.patch(prefixed(path)),
    delete: (path: string) => agent.delete(prefixed(path)),
  };
}
