import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, Profile } from 'passport-google-oauth20';
import { GOOGLE_OAUTH_SCOPE, GoogleProfile } from './google-profile.interface';
import { isGoogleOAuthConfigured } from './google-oauth.config';

// Only reached when GOOGLE_CLIENT_ID/SECRET are blank — passport-oauth2's
// constructor throws without a clientID, so this stands in for it purely to
// let the app boot. GoogleOAuthEnabledGuard blocks every route that could
// reach this strategy in that state (see auth.controller.ts), so these
// values are never actually used in a real OAuth handshake.
const UNCONFIGURED_PLACEHOLDER = 'google-oauth-not-configured';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  private readonly schoolDomain: string;

  constructor(config: ConfigService) {
    const configured = isGoogleOAuthConfigured(config);
    const callbackURL = config.get<string>('GOOGLE_CALLBACK_URL');
    super({
      clientID: configured
        ? config.get<string>('GOOGLE_CLIENT_ID')
        : UNCONFIGURED_PLACEHOLDER,
      clientSecret: configured
        ? config.get<string>('GOOGLE_CLIENT_SECRET')
        : UNCONFIGURED_PLACEHOLDER,
      callbackURL,
      scope: GOOGLE_OAUTH_SCOPE.split(' '),
    } as StrategyOptions);
    this.schoolDomain = config.get<string>('SCHOOL_GOOGLE_DOMAIN') ?? '';

    // GOOGLE_CLIENT_ID/SECRET being set is what turns Google OAuth on (see
    // docs/adr/0005) — these two being blank on top of that is a deployment
    // mistake to surface, not a second way to disable the feature.
    if (configured && (!callbackURL || !this.schoolDomain)) {
      this.logger.warn(
        'GOOGLE_CLIENT_ID/SECRET are set but GOOGLE_CALLBACK_URL or SCHOOL_GOOGLE_DOMAIN is blank — Google OAuth is misconfigured and will not work correctly.',
      );
    }
  }

  // passport-oauth2 calls this to build the extra query params on the
  // redirect to Google. Restricts Google's own login screen to the
  // school's Workspace domain (defense in depth on top of the
  // server-side hd check in AuthService).
  authorizationParams(): Record<string, string> {
    return {
      hd: this.schoolDomain,
    };
  }

  validate(accessToken: string, refreshToken: string, profile: Profile): GoogleProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('Google profile did not include an email address');
    }
    return {
      googleSub: profile.id,
      email,
      name: profile.displayName,
      hostedDomain: (profile._json as { hd?: string }).hd,
      avatarUrl: profile.photos?.[0]?.value,
    };
  }
}
