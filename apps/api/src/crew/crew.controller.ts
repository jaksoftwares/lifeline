import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { crewSyncSchema } from '@lifeline/schemas';
import { z } from 'zod';
import { Auth, AuthContext } from '../auth/auth-context';
import { Meta, RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { CrewService } from './crew.service';

@Controller('crew')
export class CrewController {
  constructor(private readonly crew: CrewService) {}

  @Get('trips')
  trips(@Auth() auth: AuthContext) {
    return this.crew.trips(auth);
  }

  /** Uploads the app's queue: status presses in order, then positions. Safe to retry. */
  @Post('sync')
  @HttpCode(200)
  sync(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(crewSyncSchema)) body: z.infer<typeof crewSyncSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.crew.sync(auth, body, meta);
  }
}
