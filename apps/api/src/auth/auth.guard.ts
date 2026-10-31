import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC } from './auth-context';
import { ACCESS_COOKIE } from './cookies';
import { SESSION_ENDED, TokenService } from './token.service';

/**
 * Global guard. Accepts the access token from the session cookie (web) or a Bearer header (mobile),
 * then confirms the session and user are still active so revocation takes effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token =
      bearerToken(req) ?? (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException('Sign in to continue.');

    const claims = await this.tokens.verifyAccess(token);
    if (!claims) throw new UnauthorizedException(SESSION_ENDED);

    const session = await this.prisma.session.findUnique({
      where: { id: claims.sessionId },
      include: { user: { include: { memberships: true } } },
    });
    if (
      !session ||
      session.userId !== claims.userId ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException(SESSION_ENDED);
    }

    req.auth = {
      userId: session.userId,
      sessionId: session.id,
      grants: session.user.memberships.map((m) => ({
        role: m.role,
        networkId: m.networkId,
        institutionId: m.institutionId,
      })),
    };
    return true;
  }
}

function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
