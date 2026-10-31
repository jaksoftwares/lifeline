import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import {
  hasPermission,
  type MembershipGrant,
  type Permission,
  type ScopeTarget,
} from '@lifeline/domain';
import { type Request } from 'express';

/** The signed-in user for the current request, loaded fresh from the database by AuthGuard. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  grants: MembershipGrant[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's documented extension point
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const IS_PUBLIC = 'lifeline:isPublic';

/** Marks a route as reachable without signing in. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<Request>().auth;
  if (!auth) throw new UnauthorizedException();
  return auth;
});

export const NOT_PERMITTED = "You don't have permission to do this.";

export function assertPermission(
  auth: AuthContext,
  permission: Permission,
  target: ScopeTarget,
): void {
  if (!hasPermission(auth.grants, permission, target)) throw new ForbiddenException(NOT_PERMITTED);
}

export function assertNetworkMember(auth: AuthContext, networkId: string): void {
  if (!auth.grants.some((grant) => grant.networkId === networkId))
    throw new ForbiddenException(NOT_PERMITTED);
}
