import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

export interface JwtPayload {
  sub: string;
  role: string;
  email: string;
  // Never present on a real session token — only on single-purpose tokens
  // like the Google-account-link state (see signGoogleLinkState in
  // auth.service.ts). validate() below rejects any payload carrying one, so
  // such a token can never be replayed as a session credential.
  purpose?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.purpose) {
      throw new UnauthorizedException('Token is not a valid session token');
    }
    const user = await this.authService.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (await this.authService.isAccountSuspended(user.id)) {
      throw new UnauthorizedException('Account has been suspended');
    }
    return user;
  }
}
