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
    @Req() req: { user: GoogleProfile },
    @Res() res: Response,
  ) {
    const { user } = await this.authService.loginWithGoogle(req.user);
    // Hand the browser a short-lived, single-use code rather than the JWT
    // itself, so the access token never appears in a redirect URL or
    // server access log — the front end exchanges it via POST /auth/exchange.
    const code = this.authService.createLoginCode(user.id);
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    // The SPA uses HashRouter, so the route must live after the `#`.
    res.redirect(`${frontendUrl}/#/auth/callback?code=${code}`);
  }

  @Post('exchange')
  exchange(@Body() body: ExchangeLoginCodeDto) {
    return this.authService.exchangeLoginCode(body.code);
  }

  @Post('register')
  register(@Body() body: RegisterWithPasswordDto) {
    return this.authService.registerWithPassword(body);
  }

  @Post('login')
  login(@Body() body: LoginWithPasswordDto) {
    return this.authService.loginWithPassword(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
