import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isGoogleOAuthConfigured } from './google-oauth.config';

// Blocks the Google OAuth routes (login kickoff, callback, account link)
// with a 404 when Google OAuth isn't configured for this deployment,
// instead of falling through to AuthGuard('google') and failing with a
// broken redirect. Must be listed ahead of the passport guard in
// @UseGuards() — Nest runs guards in array order and stops at the first
// failure, so this short-circuits before Passport ever runs.
@Injectable()
export class GoogleOAuthEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!isGoogleOAuthConfigured(this.config)) {
      throw new NotFoundException();
    }
    return true;
  }
}
