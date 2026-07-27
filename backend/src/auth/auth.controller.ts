import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { GoogleProfile } from './google-profile.interface';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { ExchangeLoginCodeDto } from './exchange-login-code.dto';
import type { RegisterWithPasswordDto } from './register-with-password.dto';
import type { LoginWithPasswordDto } from './login-with-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Passport's google strategy handles the redirect to Google;
    // this handler body never runs.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: { user: GoogleProfile; query: { state?: string } },
    @Res() res: Response,
  ) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    // The SPA uses HashRouter, so the route must live after the `#`.
    const { state } = req.query;
    if (state) {
      // `state` present means this callback came from the authenticated
      // "link Google" action (see GET /auth/google/link), not a login —
      // no login code is issued, the browser's existing session is unchanged.
      try {
        await this.authService.linkGoogleAccount(state, req.user);
        return res.redirect(`${frontendUrl}/#/auth/callback?linked=1`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to link Google account';
        return res.redirect(
          `${frontendUrl}/#/auth/callback?linked=0&reason=${encodeURIComponent(message)}`,
        );
      }
    }

    const { user } = await this.authService.loginWithGoogle(req.user);
    // Hand the browser a short-lived, single-use code rather than the JWT
    // itself, so the access token never appears in a redirect URL or
    // server access log — the front end exchanges it via POST /auth/exchange.
    const code = this.authService.createLoginCode(user.id);
    res.redirect(`${frontendUrl}/#/auth/callback?code=${code}`);
  }

  // Requires an existing session (JwtAuthGuard) — Google account linking can
  // only be initiated by an already-authenticated User, never auto-linked
  // via email match on the login page. Returns the Google authorization URL
  // as JSON (rather than redirecting this request itself) so the front end
  // can navigate the browser there directly without ever putting the
  // session's access token in a URL.
  @Get('google/link')
  @UseGuards(JwtAuthGuard)
  googleLink(@CurrentUser() user: User) {
    return { url: this.authService.buildGoogleLinkUrl(user.id) };
  }

  @Post('exchange')
  exchange(@Body() body: ExchangeLoginCodeDto) {
    return this.authService.exchangeLoginCode(body.code);
  }

  // Rate limited: credential stuffing / brute force against these two
  // endpoints was previously unbounded at every layer. See app.module.ts's
  // ThrottlerModule.forRoot for the shared limit (5 requests/60s/IP).
  @Post('register')
  @UseGuards(ThrottlerGuard)
  register(@Body() body: RegisterWithPasswordDto) {
    return this.authService.registerWithPassword(body);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  login(@Body() body: LoginWithPasswordDto) {
    return this.authService.loginWithPassword(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: User) {
    const googleLinked = await this.authService.isGoogleLinked(user.id);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      googleLinked,
    };
  }
}
