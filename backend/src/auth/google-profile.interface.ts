// Shared between GoogleStrategy (login) and AuthService.buildGoogleLinkUrl
// (account linking) so the two Google OAuth entry points can't drift apart.
export const GOOGLE_OAUTH_SCOPE =
  'email profile https://www.googleapis.com/auth/calendar.events';

export interface GoogleProfile {
  googleSub: string;
  email: string;
  name: string;
  hostedDomain?: string;
  refreshToken?: string;
}
