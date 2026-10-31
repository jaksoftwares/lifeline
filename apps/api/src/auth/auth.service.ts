import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { requiresMfa } from '@lifeline/domain';
import {
  type ChangePasswordInput,
  type CurrentUser,
  type InitialPasswordInput,
  type LoginInput,
  type MfaSetupResponse,
  type MfaVerifyInput,
} from '@lifeline/schemas';
import { toDataURL } from 'qrcode';
import { AuditService } from '../audit/audit.service';
import { type RequestMeta } from '../common/request-meta';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { type IssuedTokens } from './cookies';
import { decryptSecret, encryptSecret } from './crypto';
import {
  toCurrentUser,
  type UserWithMemberships,
  userWithMembershipsInclude,
} from './current-user';
import { hashPassword, spendPasswordCheck, verifyPassword } from './passwords';
import { TokenService } from './token.service';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const INVALID_CREDENTIALS = 'Email or password is incorrect.';
const ACCOUNT_LOCKED =
  'Too many unsuccessful attempts. Try again in 15 minutes or contact your administrator.';
const CODE_MISMATCH =
  "That code didn't match. Check the time on your phone is correct and try again.";

export type SignInResult =
  | { step: 'AUTHENTICATED'; user: CurrentUser; tokens: IssuedTokens }
  | {
      step: 'PASSWORD_CHANGE_REQUIRED' | 'MFA_SETUP_REQUIRED' | 'MFA_REQUIRED';
      challengeToken: string;
    };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  async login(input: LoginInput, meta: RequestMeta): Promise<SignInResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: userWithMembershipsInclude,
    });

    if (!user) {
      await spendPasswordCheck(input.password);
      await this.audit.record({
        action: 'auth.login.failed',
        entityType: 'user',
        metadata: { reason: 'unknown_email', email: input.email },
        meta,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    this.assertNotLocked(user);
    const passwordOk = await verifyPassword(user.passwordHash, input.password);
    // A deactivated account gets the same answer as a wrong password.
    if (!passwordOk || user.status !== 'ACTIVE') {
      if (user.status === 'ACTIVE') await this.registerFailure(user.id, 'password', meta);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    return this.nextStep(user, meta, { mfaPassed: false });
  }

  async setInitialPassword(input: InitialPasswordInput, meta: RequestMeta): Promise<SignInResult> {
    const userId = await this.tokens.verifyChallenge(input.challengeToken, 'PASSWORD_CHANGE');
    const user = await this.loadActiveUser(userId);
    if (!user.mustChangePassword)
      throw new UnauthorizedException('Your sign-in attempt has expired. Start again.');
    if (await verifyPassword(user.passwordHash, input.newPassword)) {
      throw new BadRequestException('Choose a password different from your temporary password.');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
      include: userWithMembershipsInclude,
    });
    await this.audit.record({
      action: 'auth.password.changed',
      entityType: 'user',
      entityId: user.id,
      actorId: user.id,
      metadata: { initial: true },
      meta,
    });
    return this.nextStep(updated, meta, { mfaPassed: false });
  }

  async startMfaSetup(challengeToken: string): Promise<MfaSetupResponse> {
    const userId = await this.tokens.verifyChallenge(challengeToken, 'MFA_SETUP');
    const user = await this.loadActiveUser(userId);
    if (user.mfaEnabled)
      throw new BadRequestException('Two-step verification is already set up. Sign in again.');

    // Reuse a pending secret so a reloaded or repeated setup screen still matches the app already scanned.
    let secret: string;
    if (user.mfaPendingSecret) {
      secret = decryptSecret(user.mfaPendingSecret, this.config.mfaKey);
    } else {
      secret = generateTotpSecret();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mfaPendingSecret: encryptSecret(secret, this.config.mfaKey) },
      });
    }
    const url = otpauthUrl(secret, user.email);
    return {
      secret,
      otpauthUrl: url,
      qrCodeDataUrl: await toDataURL(url, {
        margin: 1,
        width: 220,
        color: { dark: '#12304A', light: '#FFFFFF' },
      }),
    };
  }

  async confirmMfaSetup(input: MfaVerifyInput, meta: RequestMeta): Promise<SignInResult> {
    const userId = await this.tokens.verifyChallenge(input.challengeToken, 'MFA_SETUP');
    const user = await this.loadActiveUser(userId);
    if (user.mfaEnabled || !user.mfaPendingSecret) {
      throw new BadRequestException('Start authenticator setup again.');
    }

    const secret = decryptSecret(user.mfaPendingSecret, this.config.mfaKey);
    const step = verifyTotp(secret, input.code);
    if (step === null) throw new BadRequestException(CODE_MISMATCH);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaSecret: user.mfaPendingSecret,
        mfaPendingSecret: null,
        mfaEnabled: true,
        mfaLastUsedStep: step,
      },
      include: userWithMembershipsInclude,
    });
    await this.audit.record({
      action: 'auth.mfa.enabled',
      entityType: 'user',
      entityId: user.id,
      actorId: user.id,
      meta,
    });
    return this.nextStep(updated, meta, { mfaPassed: true });
  }

  async verifyMfa(input: MfaVerifyInput, meta: RequestMeta): Promise<SignInResult> {
    const userId = await this.tokens.verifyChallenge(input.challengeToken, 'MFA_VERIFY');
    const user = await this.loadActiveUser(userId);
    this.assertNotLocked(user);
    if (!user.mfaEnabled || !user.mfaSecret)
      throw new UnauthorizedException('Your sign-in attempt has expired. Start again.');

    const secret = decryptSecret(user.mfaSecret, this.config.mfaKey);
    const step = verifyTotp(secret, input.code, { lastUsedStep: user.mfaLastUsedStep });
    if (step === null) {
      await this.registerFailure(user.id, 'mfa', meta);
      throw new UnauthorizedException(CODE_MISMATCH);
    }

    // Conditional update so two concurrent requests cannot both spend the same code.
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
      data: { mfaLastUsedStep: step, failedLoginCount: 0 },
    });
    if (count === 0) throw new UnauthorizedException(CODE_MISMATCH);

    return this.nextStep(user, meta, { mfaPassed: true });
  }

  refresh(refreshToken: string, meta: RequestMeta): Promise<IssuedTokens> {
    return this.tokens.refresh(refreshToken, meta);
  }

  async logout(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    await this.tokens.revoke(sessionId, 'logout');
    await this.audit.record({
      action: 'auth.logout',
      entityType: 'session',
      entityId: sessionId,
      actorId: userId,
      meta,
    });
  }

  async changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordInput,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.loadActiveUser(userId);
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Some fields need attention.',
        errors: [{ path: 'currentPassword', message: 'Your current password is incorrect.' }],
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() },
    });
    // Other devices must sign in again with the new password.
    await this.tokens.revokeAllForUser(userId, 'password_changed', sessionId);
    await this.audit.record({
      action: 'auth.password.changed',
      entityType: 'user',
      entityId: userId,
      actorId: userId,
      meta,
    });
  }

  async currentUser(userId: string): Promise<CurrentUser> {
    return toCurrentUser(await this.loadActiveUser(userId));
  }

  private async nextStep(
    user: UserWithMemberships,
    meta: RequestMeta,
    { mfaPassed }: { mfaPassed: boolean },
  ): Promise<SignInResult> {
    if (user.mustChangePassword) {
      return {
        step: 'PASSWORD_CHANGE_REQUIRED',
        challengeToken: await this.tokens.signChallenge(user.id, 'PASSWORD_CHANGE'),
      };
    }
    if (user.mfaEnabled && !mfaPassed) {
      return {
        step: 'MFA_REQUIRED',
        challengeToken: await this.tokens.signChallenge(user.id, 'MFA_VERIFY'),
      };
    }
    if (!user.mfaEnabled && requiresMfa(user.memberships)) {
      return {
        step: 'MFA_SETUP_REQUIRED',
        challengeToken: await this.tokens.signChallenge(user.id, 'MFA_SETUP'),
      };
    }

    const tokens = await this.tokens.createSession(user.id, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      action: 'auth.login.succeeded',
      entityType: 'session',
      entityId: tokens.sessionId,
      actorId: user.id,
      metadata: { mfa: user.mfaEnabled },
      meta,
    });
    return { step: 'AUTHENTICATED', user: toCurrentUser(user), tokens };
  }

  private async loadActiveUser(userId: string): Promise<UserWithMemberships> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userWithMembershipsInclude,
    });
    if (!user || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    return user;
  }

  private assertNotLocked(user: { lockedUntil: Date | null }): void {
    if (user.lockedUntil && user.lockedUntil > new Date())
      throw new UnauthorizedException(ACCOUNT_LOCKED);
  }

  private async registerFailure(
    userId: string,
    reason: 'password' | 'mfa',
    meta: RequestMeta,
  ): Promise<void> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
    });
    const locked = failedLoginCount >= MAX_FAILED_ATTEMPTS;
    if (locked) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
      });
    }
    await this.audit.record({
      action: 'auth.login.failed',
      entityType: 'user',
      entityId: userId,
      actorId: userId,
      metadata: { reason, ...(locked ? { locked: true } : {}) },
      meta,
    });
    if (locked) throw new UnauthorizedException(ACCOUNT_LOCKED);
  }
}
