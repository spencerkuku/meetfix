import { ConfigService } from '@nestjs/config';

// Google OAuth is a genuinely optional deployment feature (see
// docs/adr/0005-optional-google-oauth.md) — a school with no Google
// Workspace leaves these two blank, and the whole feature (backend routes,
// frontend buttons) disappears rather than existing in a broken state.
// GOOGLE_CALLBACK_URL/SCHOOL_GOOGLE_DOMAIN being blank while these two are
// set is a deployment misconfiguration, not a signal to disable the
// feature, so they're deliberately not checked here.
export function isGoogleOAuthConfigured(config: ConfigService): boolean {
  return (
    !!config.get<string>('GOOGLE_CLIENT_ID') &&
    !!config.get<string>('GOOGLE_CLIENT_SECRET')
  );
}
