import { Controller, Get, Query } from '@nestjs/common';
import { listAuditEventsQuerySchema } from '@lifeline/schemas';
import { z } from 'zod';
import { Auth, AuthContext } from '../auth/auth-context';
import { ZodPipe } from '../common/zod.pipe';
import { AuditService } from './audit.service';

@Controller('audit-events')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(listAuditEventsQuerySchema))
    query: z.infer<typeof listAuditEventsQuerySchema>,
  ) {
    return this.audit.list(auth, query);
  }
}
