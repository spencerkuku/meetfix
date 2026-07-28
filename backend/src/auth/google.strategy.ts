import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, Profile } from 'passport-google-oauth20';
import { GOOGLE_OAUTH_SCOPE, GoogleProfile } from './google-profile.interface';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly schoolDomain: string;

  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL'),
      scope: GOOGLE_OAUTH_SCOPE.split(' '),
    } as StrategyOptions);
    this.schoolDomain = config.get<string>('SCHOOL_GOOGLE_DOMAIN') ?? '';
  }

  // passport-oauth2 calls this to build the extra query params on the
  // redirect to Google. Always ask for a refresh token, and restrict
  // Google's own login screen to the school's Workspace domain (defense
  // in depth on top of the server-side hd check in AuthService).
  authorizationParams(): Record<string, string> {
    return {
      access_type: 'offline',
      prompt: 'consent',
      hd: this.schoolDomain,
    };
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): GoogleProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('Google profile did not include an email address');
    }
    return {
      googleSub: profile.id,
      email,
      name: profile.displayName,
      hostedDomain: (profile._json as { hd?: string }).hd,
      refreshToken,
      avatarUrl: profile.photos?.[0]?.value,
    };
  }
}
