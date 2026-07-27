import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AccountProvider,
  AccountStatus,
  Prisma,
  Role,
  User,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleProfile } from './google-profile.interface';
import { TokenEncryptionService } from './token-encryption.service';
import { RegisterWithPasswordDto } from './register-with-password.dto';
import { LoginWithPasswordDto } from './login-with-password.dto';

const LOGIN_CODE_TTL_MS = 60_000;
const PASSWORD_HASH_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class AuthService {
  // One-time codes handed to the browser instead of the JWT itself, so the
  // access token never appears in a redirect URL / access log. Single
  // Nest instance only — see ADR-0002 (this app is not designed to run
  // multiple replicas).
  private readonly pendingLoginCodes = new Map<
    string,
    { userId: string; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  async loginWithGoogle(profile: GoogleProfile): Promise<{ user: User }> {
    const schoolDomain = this.config.get<string>('SCHOOL_GOOGLE_DOMAIN');
    if (!schoolDomain || profile.hostedDomain !== schoolDomain) {
      throw new UnauthorizedException(
        'Google account is not part of the school Workspace domain',
      );
    }

    const existingAccount = await this.prisma.account.findUnique({
      where: { googleSub: profile.googleSub },
    });

    const encryptedRefreshToken = profile.refreshToken
      ? this.tokenEncryption.encrypt(profile.refreshToken)
      : undefined;

    let user: User;
    if (existingAccount) {
      user = await this.prisma.user.update({
        where: { id: existingAccount.userId },
        data: { name: profile.name, email: profile.email },
      });
      if (encryptedRefreshToken) {
        await this.prisma.account.update({
          where: { id: existingAccount.id },
          data: { googleRefreshToken: encryptedRefreshToken },
        });
      }
    } else {
      try {
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            role: Role.USER,
            account: {
              create: {
                provider: AccountProvider.GOOGLE,
                googleSub: profile.googleSub,
                googleRefreshToken: encryptedRefreshToken,
              },
            },
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException(
            'An account already exists for this email address',
          );
        }
        throw err;
      }
    }

    return { user };
  }

  createLoginCode(userId: string): string {
    const code = randomBytes(24).toString('hex');
    this.pendingLoginCodes.set(code, {
      userId,
      expiresAt: Date.now() + LOGIN_CODE_TTL_MS,
    });
    return code;
  }

  async exchangeLoginCode(code: string): Promise<{ accessToken: string }> {
    const entry = this.pendingLoginCodes.get(code);
    this.pendingLoginCodes.delete(code); // single-use regardless of outcome
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('Login code is invalid or expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: entry.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return { accessToken: await this.signToken(user) };
  }

  // Password registration (ADR-0003): a second Account path alongside
  // Google OAuth, gated by the Admin-maintained Auto-Approved Domain list.
  async registerWithPassword(
    dto: RegisterWithPasswordDto,
  ): Promise<{ status: AccountStatus }> {
    if (!dto.email?.trim() || !dto.name?.trim() || !dto.password) {
      throw new BadRequestException('email, name and password are required');
    }
    if (dto.password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const domain = dto.email.split('@')[1]?.toLowerCase();
    const autoApproved =
      !!domain &&
      (await this.prisma.autoApprovedDomain.findUnique({
        where: { domain },
      }));
    const status = autoApproved ? AccountStatus.ACTIVE : AccountStatus.PENDING;
    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);

    try {
      await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          role: Role.USER,
          account: {
            create: {
              provider: AccountProvider.PASSWORD,
              status,
              passwordHash,
            },
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account already exists for this email address',
        );
      }
      throw err;
    }

    return { status };
  }

  async loginWithPassword(
    dto: LoginWithPasswordDto,
  ): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { account: true },
    });
    const account = user?.account;
    const valid =
      !!account?.passwordHash &&
      account.provider === AccountProvider.PASSWORD &&
      (await bcrypt.compare(dto.password, account.passwordHash));
    if (!user || !account || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (account.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException(
        'This account is pending Admin approval',
      );
    }

    return { accessToken: await this.signToken(user) };
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  private async signToken(user: User): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      email: user.email,
    });
  }
}
