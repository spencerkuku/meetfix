import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { localDateToUtcInstant } from './repairs';

describe('localDateToUtcInstant', () => {
  // Fixed to a non-UTC offset so the conversion's correctness doesn't
  // depend on whichever timezone happens to run this suite — this is
  // exactly the deployment scenario (a non-UTC school timezone) the bug
  // this closes only manifests in. Scoped to this file's beforeAll/afterAll
  // (not a bare module-scope assignment) since Vitest reuses worker
  // processes across spec files and does not reset process.env between
  // them — an unrestored TZ here would otherwise leak into any other
  // frontend spec that runs local-timezone-dependent Date logic in the
  // same worker.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Taipei';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('converts a local calendar day start to the correct UTC instant', () => {
    // 2026-09-01 00:00:00 in Asia/Taipei (UTC+8) is 2026-08-31T16:00:00.000Z.
    expect(localDateToUtcInstant('2026-09-01', false)).toBe(
      '2026-08-31T16:00:00.000Z',
    );
  });

  it('converts a local calendar day end to the correct UTC instant', () => {
    // 2026-09-01 23:59:59.999 in Asia/Taipei (UTC+8) is 2026-09-01T15:59:59.999Z.
    expect(localDateToUtcInstant('2026-09-01', true)).toBe(
      '2026-09-01T15:59:59.999Z',
    );
  });
});
