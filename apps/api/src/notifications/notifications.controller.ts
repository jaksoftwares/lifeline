import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  listNotificationsQuerySchema,
  notificationSettingsQuerySchema,
  updateNotificationSettingsSchema,
} from '@lifeline/schemas';
import { z } from 'zod';
import { Auth, type AuthContext } from '../auth/auth-context';
import { Meta, type RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(listNotificationsQuerySchema))
    query: z.infer<typeof listNotificationsQuerySchema>,
  ) {
    return this.notifications.list(auth, query);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(notificationSettingsQuerySchema))
    query: z.infer<typeof notificationSettingsQuerySchema>,
  ) {
    return this.notifications.markAllRead(auth, query.networkId);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.notifications.markRead(auth, id);
  }

  @Get('settings')
  settings(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(notificationSettingsQuerySchema))
    query: z.infer<typeof notificationSettingsQuerySchema>,
  ) {
    return this.notifications.settings(auth, query.networkId);
  }

  @Put('settings')
  updateSettings(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(updateNotificationSettingsSchema))
    body: z.infer<typeof updateNotificationSettingsSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notifications.updateSettings(auth, body, meta);
  }
}
