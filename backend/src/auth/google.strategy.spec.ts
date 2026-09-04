import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './google.strategy';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('GoogleStrategy — misconfiguration warning', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('warns when configured but GOOGLE_CALLBACK_URL is blank', () => {
    new GoogleStrategy(
      configWith({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_CALLBACK_URL: '',
        SCHOOL_GOOGLE_DOMAIN: 'school.edu.tw',
      }),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('misconfigured'),
    );
  });

  it('warns when configured but SCHOOL_GOOGLE_DOMAIN is blank', () => {
    new GoogleStrategy(
      configWith({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_CALLBACK_URL: 'https://example.com/callback',
        SCHOOL_GOOGLE_DOMAIN: '',
      }),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('misconfigured'),
    );
  });

  it('does not warn when fully configured', () => {
    new GoogleStrategy(
      configWith({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_CALLBACK_URL: 'https://example.com/callback',
        SCHOOL_GOOGLE_DOMAIN: 'school.edu.tw',
      }),
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when Google OAuth is simply unconfigured', () => {
    new GoogleStrategy(configWith({}));

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
