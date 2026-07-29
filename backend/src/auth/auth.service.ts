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
import { GOOGLE_OAUTH_SCOPE, GoogleProfile } from './google-profile.interface';
import { TokenEncryptionService } from './token-encryption.service';
import { RegisterWithPasswordDto } from './register-with-password.dto';
import { LoginWithPasswordDto } from './login-with-password.dto';
import { ChangePasswordDto } from './change-password.dto';

const LOGIN_CODE_TTL_MS = 60_000;
const PASSWORD_HASH_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const GOOGLE_LINK_STATE_PURPOSE = 'google-account-link';
// A valid bcrypt hash of an arbitrary, unused password — never matches a
// real login attempt, and exists solely so loginWithPassword always pays
// bcrypt's cost, whether or not the requested email has an Account. See
// where it's used for why.
const DUMMY_PASSWORD_HASH =
  '$2a$10$CwTycUXWue0Thq9StjUM0uJ8g8vHU8WPPRZuJdSp1Nz1cCf/aG7QW';

// Every dot-bounded suffix of `domain`, including itself — candidates for
// an Auto-Approved Domain lookup. Built from `.`-boundaries only, so a
// lookalike like `evilxxx.edu.tw` can never produce `xxx.edu.tw` as a
// candidate and therefore can never match it as a subdomain.
function domainAndAncestors(domain: string): string[] {
  const labels = domain.split('.');
  return labels.map((_, i) => labels.slice(i).join('.'));
}

// True when `hostedDomain` is the school's Google Workspace domain itself,
// or a dot-bounded subdomain of it (e.g. `stu.school.edu.tw` for a
// `school.edu.tw` config) — schools commonly split students/staff across
// Workspace subdomains, and there's only ever one configured school domain
// here (unlike Auto-Approved Domain's per-entry opt-in), so subdomain trust
// is unconditional rather than a toggle.
function isSchoolWorkspaceDomain(
  hostedDomain: string | undefined,
  schoolDomain: string,
): boolean {
  return (
    !!hostedDomain &&
    (hostedDomain === schoolDomain || hostedDomain.endsWith(`.${schoolDomain}`))
  );
}

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
    if (!schoolDomain || !isSchoolWorkspaceDomain(profile.hostedDomain, schoolDomain)) {
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
        data: {
          name: profile.name,
          email: profile.email,
          avatarUrl: profile.avatarUrl ?? null,
        },
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
            avatarUrl: profile.avatarUrl ?? null,
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
            'An account already exists for this email address. Log in with your password and link Google from your profile instead.',
          );
        }
        throw err;
      }
    }

    return { user };
  }

  // Google account linking: lets a password-Account User attach a Google
  // identity to their existing Account (e.g. for Calendar sync), initiated
  // only from an authenticated profile action — never auto-linked from the
  // login page, so a mere email match on the Google side can never take
  // over someone else's password Account.
  buildGoogleLinkUrl(userId: string): string {
    const state = this.signGoogleLinkState(userId);
    const params = new URLSearchParams({
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID') ?? '',
      redirect_uri: this.config.get<string>('GOOGLE_CALLBACK_URL') ?? '',
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      hd: this.config.get<string>('SCHOOL_GOOGLE_DOMAIN') ?? '',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async linkGoogleAccount(
    state: string,
    profile: GoogleProfile,
  ): Promise<{ user: User }> {
    const userId = this.verifyGoogleLinkState(state);

    const schoolDomain = this.config.get<string>('SCHOOL_GOOGLE_DOMAIN');
    if (!schoolDomain || !isSchoolWorkspaceDomain(profile.hostedDomain, schoolDomain)) {
      throw new UnauthorizedException(
        'Google account is not part of the school Workspace domain',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { account: true },
    });
    if (!user || !user.account) {
      throw new UnauthorizedException('No account found to link Google to');
    }
    if (user.email !== profile.email) {
      throw new ConflictException(
        'The Google account email must match your account email',
      );
    }

    const googleSubOwner = await this.prisma.account.findUnique({
      where: { googleSub: profile.googleSub },
    });
    if (googleSubOwner && googleSubOwner.userId !== userId) {
      throw new ConflictException(
        'This Google account is already linked to a different user',
      );
    }

    await this.prisma.account.update({
      where: { userId },
      data: {
        googleSub: profile.googleSub,
        ...(profile.refreshToken
          ? { googleRefreshToken: this.tokenEncryption.encrypt(profile.refreshToken) }
          : {}),
      },
    });

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: profile.avatarUrl ?? null },
    });

    return { user: updatedUser };
  }

  private signGoogleLinkState(userId: string): string {
    return this.jwt.sign(
      { sub: userId, purpose: GOOGLE_LINK_STATE_PURPOSE },
      { expiresIn: '5m' },
    );
  }

  private verifyGoogleLinkState(state: string): string {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwt.verify(state);
    } catch {
      throw new UnauthorizedException('Google link request is invalid or expired');
    }
    if (payload.purpose !== GOOGLE_LINK_STATE_PURPOSE) {
      throw new UnauthorizedException('Google link request is invalid');
    }
    return payload.sub;
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
    let autoApproved = false;
    if (domain) {
      const candidates = await this.prisma.autoApprovedDomain.findMany({
        where: { domain: { in: domainAndAncestors(domain) } },
      });
      autoApproved = candidates.some(
        (entry) =>
          entry.domain === domain ||
          (entry.allowSubdomains && domain.endsWith(`.${entry.domain}`)),
      );
    }
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
    // Always run bcrypt.compare, even against a fixed dummy hash when no
    // matching password Account exists, so response timing never reveals
    // whether a given email is registered — a short-circuit here would skip
    // bcrypt's ~50-100ms cost only for nonexistent accounts, a measurable
    // signal for user enumeration.
    const hashToCompareAgainst = account?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const bcryptMatched = await bcrypt.compare(
      dto.password,
      hashToCompareAgainst,
    );
    const valid =
      !!account?.passwordHash &&
      account.provider === AccountProvider.PASSWORD &&
      bcryptMatched;
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

  // Self-service password change. Eligibility is keyed off `passwordHash`
  // existing, not the Account's `provider` — linking Google onto an
  // existing password Account (see linkGoogleAccount) leaves `provider`
  // as PASSWORD and the passwordHash untouched, so a dual-login Account
  // must still be able to change its password here.
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if (!dto.currentPassword || !dto.newPassword) {
      throw new BadRequestException(
        'currentPassword and newPassword are required',
      );
    }
    if (dto.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const account = await this.prisma.account.findUnique({
      where: { userId },
    });
    if (!account?.passwordHash) {
      throw new BadRequestException(
        'This account has no password set — it can only sign in with Google',
      );
    }

    const valid = await bcrypt.compare(
      dto.currentPassword,
      account.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      PASSWORD_HASH_ROUNDS,
    );
    await this.prisma.account.update({
      where: { userId },
      data: { passwordHash },
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getAccountFlags(
    userId: string,
  ): Promise<{ googleLinked: boolean; hasPassword: boolean }> {
    const account = await this.prisma.account.findUnique({
      where: { userId },
    });
    return {
      googleLinked: account?.googleSub != null,
      hasPassword: account?.passwordHash != null,
    };
  }

  private async signToken(user: User): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      email: user.email,
    });
  }
}
