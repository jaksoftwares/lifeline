import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export function requestMeta(req: Request): RequestMeta {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  };
}

/** Client IP and user agent, for audit records and session metadata. */
export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  requestMeta(ctx.switchToHttp().getRequest<Request>()),
);
