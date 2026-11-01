import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthStepResponse,
  challengeSchema,
  changePasswordSchema,
  initialPasswordSchema,
  loginSchema,
  mfaVerifySchema,
  MOBILE_CLIENT_HEADER,
  type MobileTokens,
  mobileRefreshSchema,
} from '@lifeline/schemas';
import { Request, Response } from 'express';
import { z } from 'zod';
import { Meta, RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { AppConfig } from '../config/app-config';
import { Auth, AuthContext, Public } from './auth-context';
import { AuthService, SignInResult } from './auth.service';
import {
  ACCESS_TTL_SECONDS,
  clearAuthCookies,
  type IssuedTokens,
  REFRESH_COOKIE,
  setAuthCookies,
} from './cookies';

// Sign-in endpoints get a much tighter rate limit than the rest of the API.
const SIGN_IN_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthStepResponse> {
    return this.respond(req, res, await this.auth.login(body, meta));
  }

  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post('password/initial')
  @HttpCode(200)
  async initialPassword(
    @Body(new ZodPipe(initialPasswordSchema)) body: z.infer<typeof initialPasswordSchema>,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthStepResponse> {
    return this.respond(req, res, await this.auth.setInitialPassword(body, meta));
  }

  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@Body(new ZodPipe(challengeSchema)) body: z.infer<typeof challengeSchema>) {
    return this.auth.startMfaSetup(body.challengeToken);
  }

  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post('mfa/setup/confirm')
  @HttpCode(200)
  async mfaSetupConfirm(
    @Body(new ZodPipe(mfaVerifySchema)) body: z.infer<typeof mfaVerifySchema>,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthStepResponse> {
    return this.respond(req, res, await this.auth.confirmMfaSetup(body, meta));
  }

  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post('mfa/verify')
  @HttpCode(200)
  async mfaVerify(
    @Body(new ZodPipe(mfaVerifySchema)) body: z.infer<typeof mfaVerifySchema>,
    @Meta() meta: RequestMeta,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthStepResponse> {
    return this.respond(req, res, await this.auth.verifyMfa(body, meta));
  }

  @Public()
  @Post('refresh')
  @HttpCode(204)
  async refresh(
    @Req() req: Request,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Your session has ended. Sign in again.');
    try {
      setAuthCookies(res, await this.auth.refresh(token, meta), this.config.cookieSecure);
    } catch (error) {
      clearAuthCookies(res, this.config.cookieSecure);
      throw error;
    }
  }

  /** The crew app's refresh: the token travels in the body and new tokens come back the same way. */
  @Public()
  @Post('mobile/refresh')
  @HttpCode(200)
  async mobileRefresh(
    @Body(new ZodPipe(mobileRefreshSchema)) body: z.infer<typeof mobileRefreshSchema>,
    @Meta() meta: RequestMeta,
  ): Promise<MobileTokens> {
    return toMobileTokens(await this.auth.refresh(body.refreshToken, meta));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Auth() auth: AuthContext,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(auth.userId, auth.sessionId, meta);
    clearAuthCookies(res, this.config.cookieSecure);
  }

  @Get('me')
  me(@Auth() auth: AuthContext) {
    return this.auth.currentUser(auth.userId);
  }

  @Post('password/change')
  @HttpCode(204)
  async changePassword(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
    @Meta() meta: RequestMeta,
  ) {
    await this.auth.changePassword(auth.userId, auth.sessionId, body, meta);
  }

  private respond(req: Request, res: Response, result: SignInResult): AuthStepResponse {
    if (result.step !== 'AUTHENTICATED') return result;
    if (req.get(MOBILE_CLIENT_HEADER) === 'mobile') {
      return { step: 'AUTHENTICATED', user: result.user, tokens: toMobileTokens(result.tokens) };
    }
    setAuthCookies(res, result.tokens, this.config.cookieSecure);
    return { step: 'AUTHENTICATED', user: result.user };
  }
}

function toMobileTokens(tokens: IssuedTokens): MobileTokens {
  return {
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    accessExpiresInSeconds: ACCESS_TTL_SECONDS,
    sessionExpiresAt: tokens.sessionExpiresAt.toISOString(),
  };
}
