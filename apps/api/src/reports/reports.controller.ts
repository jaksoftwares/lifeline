import { Body, Controller, Get, Param, Put, Query, Res } from '@nestjs/common';
import { reportQuerySchema, updateNetworkSettingsSchema } from '@lifeline/schemas';
import { type Response } from 'express';
import { type z } from 'zod';
import { Auth, type AuthContext } from '../auth/auth-context';
import { Meta, type RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports/success-metrics')
  metrics(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(reportQuerySchema)) query: z.infer<typeof reportQuerySchema>,
  ) {
    return this.reports.successMetrics(auth, query);
  }

  @Get('reports/success-metrics.csv')
  async csv(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(reportQuerySchema)) query: z.infer<typeof reportQuerySchema>,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reports.csv(auth, query);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    });
    res.end(`\uFEFF${file.data}`);
  }

  @Get('reports/success-metrics.pdf')
  async pdf(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(reportQuerySchema)) query: z.infer<typeof reportQuerySchema>,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reports.pdf(auth, query);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(file.data.length),
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    });
    res.end(file.data);
  }

  @Get('networks/:networkId/settings')
  networkSettings(@Auth() auth: AuthContext, @Param('networkId') networkId: string) {
    return this.reports.networkSettings(auth, networkId);
  }

  @Put('networks/:networkId/settings')
  updateNetworkSettings(
    @Auth() auth: AuthContext,
    @Param('networkId') networkId: string,
    @Body(new ZodPipe(updateNetworkSettingsSchema.omit({ networkId: true })))
    body: Omit<z.infer<typeof updateNetworkSettingsSchema>, 'networkId'>,
    @Meta() meta: RequestMeta,
  ) {
    return this.reports.updateNetworkSettings(auth, { ...body, networkId }, meta);
  }
}
