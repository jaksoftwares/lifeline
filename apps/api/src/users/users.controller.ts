import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { createUserSchema, listUsersQuerySchema, membershipInputSchema } from '@lifeline/schemas';
import { z } from 'zod';
import { Auth, AuthContext } from '../auth/auth-context';
import { Meta, RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(listUsersQuerySchema)) query: z.infer<typeof listUsersQuerySchema>,
  ) {
    return this.users.list(auth, query);
  }

  @Post('users')
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createUserSchema)) body: z.infer<typeof createUserSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.users.create(auth, body, meta);
  }

  @Post('users/:userId/memberships')
  addMembership(
    @Auth() auth: AuthContext,
    @Param('userId') userId: string,
    @Body(new ZodPipe(membershipInputSchema)) body: z.infer<typeof membershipInputSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.users.addMembership(auth, userId, body, meta);
  }

  @Delete('memberships/:membershipId')
  @HttpCode(204)
  revokeMembership(
    @Auth() auth: AuthContext,
    @Param('membershipId') membershipId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.users.revokeMembership(auth, membershipId, meta);
  }

  @Post('users/:userId/deactivate')
  @HttpCode(204)
  deactivate(
    @Auth() auth: AuthContext,
    @Param('userId') userId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.users.setStatus(auth, userId, 'DEACTIVATED', meta);
  }

  @Post('users/:userId/reactivate')
  @HttpCode(204)
  reactivate(
    @Auth() auth: AuthContext,
    @Param('userId') userId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.users.setStatus(auth, userId, 'ACTIVE', meta);
  }

  @Post('users/:userId/mfa/reset')
  @HttpCode(204)
  resetMfa(@Auth() auth: AuthContext, @Param('userId') userId: string, @Meta() meta: RequestMeta) {
    return this.users.resetMfa(auth, userId, meta);
  }
}
