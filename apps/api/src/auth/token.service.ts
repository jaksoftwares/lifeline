import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import { type RequestMeta } from '../common/request-meta';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TTL_SECONDS, type IssuedTokens } from './cookies';
import { randomToken, safeEqual, sha256 } from './crypto';

/** One working shift. Users sign in again after this regardless of activity. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CHALLENGE_TTL_SECONDS = 10 * 60;
/** Two tabs refreshing at once both present the same token; the second is tolerated for this long. */
const ROTATION_GRACE_MS = 30 * 1000;

export type ChallengeStage = 'PASSWORD_CHANGE' | 'MFA_SETUP' | 'MFA_VERIFY';

export const SESSION_ENDED = 'Your session has ended. Sign in again.';
const CHALLENGE_EXPIRED = 'Your sign-in attempt has expired. Start again.';

interface AccessClaims {
  sub: string;
  sid: string;
  typ: 'access';
}

interface ChallengeClaims {
  sub: string;
  stage: ChallengeStage;
  typ: 'challenge';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  private get secret() {
    return this.config.env.JWT_SECRET;
  }

  signAccess(userId: string, sessionId: string): Promise<string> {
    const claims: AccessClaims = { sub: userId, sid: sessionId, typ: 'access' };
    return this.jwt.signAsync(claims, {
      secret: this.secret,
      expiresIn: ACCESS_TTL_SECONDS,
      algorithm: 'HS256',
    });
  }

  async verifyAccess(token: string): Promise<{ userId: string; sessionId: string } | null> {
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      return claims.typ === 'access' ? { userId: claims.sub, sessionId: claims.sid } : null;
    } catch {
      return null;
    }
  }

  signChallenge(userId: string, stage: ChallengeStage): Promise<string> {
    const claims: ChallengeClaims = { sub: userId, stage, typ: 'challenge' };
    return this.jwt.signAsync(claims, {
      secret: this.secret,
      expiresIn: CHALLENGE_TTL_SECONDS,
      algorithm: 'HS256',
    });
  }

  async verifyChallenge(token: string, stage: ChallengeStage): Promise<string> {
    try {
      const claims = await this.jwt.verifyAsync<ChallengeClaims>(token, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      if (claims.typ === 'challenge' && claims.stage === stage) return claims.sub;
    } catch {
      // fall through
    }
    throw new UnauthorizedException(CHALLENGE_EXPIRED);
  }

  async createSession(
    userId: string,
    meta: RequestMeta,
  ): Promise<IssuedTokens & { sessionId: string }> {
    const secret = randomToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshHash: sha256(secret),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });
    return {
      sessionId: session.id,
      accessToken: await this.signAccess(userId, session.id),
      refreshToken: `${session.id}.${secret}`,
      sessionExpiresAt: session.expiresAt,
    };
  }

  /**
   * Exchanges a refresh token for a new access token and rotates the refresh token. Presenting an
   * already-rotated token outside the grace window is treated as theft and ends the session.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<IssuedTokens> {
    const dot = refreshToken.indexOf('.');
    if (dot <= 0) throw new UnauthorizedException(SESSION_ENDED);
    const sessionId = refreshToken.slice(0, dot);
    const presentedHash = sha256(refreshToken.slice(dot + 1));

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException(SESSION_ENDED);
    }

    if (safeEqual(presentedHash, session.refreshHash)) {
      const nextSecret = randomToken();
      const { count } = await this.prisma.session.updateMany({
        where: { id: session.id, refreshHash: presentedHash },
        data: {
          refreshHash: sha256(nextSecret),
          previousRefreshHash: presentedHash,
          rotatedAt: now,
          lastUsedAt: now,
        },
      });
      return {
        accessToken: await this.signAccess(session.userId, session.id),
        // count 0 means a concurrent request rotated first; its response carries the new cookie.
        refreshToken: count === 1 ? `${session.id}.${nextSecret}` : undefined,
        sessionExpiresAt: session.expiresAt,
      };
    }

    const withinGrace =
      session.previousRefreshHash !== null &&
      safeEqual(presentedHash, session.previousRefreshHash) &&
      session.rotatedAt !== null &&
      now.getTime() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
    if (withinGrace) {
      return {
        accessToken: await this.signAccess(session.userId, session.id),
        sessionExpiresAt: session.expiresAt,
      };
    }

    await this.revoke(session.id, 'refresh_token_reuse');
    await this.audit.record({
      action: 'auth.session.token_reuse_detected',
      entityType: 'session',
      entityId: session.id,
      actorId: session.userId,
      meta,
    });
    throw new UnauthorizedException(SESSION_ENDED);
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
