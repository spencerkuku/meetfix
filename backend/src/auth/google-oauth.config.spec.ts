import { ConfigService } from '@nestjs/config';
import { isGoogleOAuthConfigured } from './google-oauth.config';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('isGoogleOAuthConfigured', () => {
  it('is true when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set', () => {
    const config = configWith({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
    });
    expect(isGoogleOAuthConfigured(config)).toBe(true);
  });

  it('is false when GOOGLE_CLIENT_ID is blank', () => {
    const config = configWith({
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: 'client-secret',
    });
    expect(isGoogleOAuthConfigured(config)).toBe(false);
  });

  it('is false when GOOGLE_CLIENT_SECRET is blank', () => {
    const config = configWith({
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: '',
    });
    expect(isGoogleOAuthConfigured(config)).toBe(false);
  });

  it('is false when both are unset', () => {
    const config = configWith({});
    expect(isGoogleOAuthConfigured(config)).toBe(false);
  });
});
