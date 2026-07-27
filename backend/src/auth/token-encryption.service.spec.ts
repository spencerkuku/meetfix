import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

describe('TokenEncryptionService', () => {
  const config = {
    get: () =>
      '8022e5b5c85e8fc243a2b798f01ba1cdde103e15e56a812f917d132ef17b028e',
  } as unknown as ConfigService;
  const service = new TokenEncryptionService(config);

  it('decrypts what it encrypted', () => {
    const encrypted = service.encrypt('super-secret-refresh-token');
    expect(encrypted).not.toContain('super-secret-refresh-token');
    expect(service.decrypt(encrypted)).toBe('super-secret-refresh-token');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = service.encrypt('same-plaintext');
    const b = service.encrypt('same-plaintext');
    expect(a).not.toBe(b);
  });

  it('throws when ENCRYPTION_KEY is missing or the wrong length', () => {
    const badConfig = { get: () => undefined } as unknown as ConfigService;
    expect(() => new TokenEncryptionService(badConfig)).toThrow();
  });
});
