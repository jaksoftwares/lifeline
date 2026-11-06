import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  networkId: z.string().min(1),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const notificationSettingsQuerySchema = z.object({
  networkId: z.string().min(1),
});

export const updateNotificationSettingsSchema = z.object({
  networkId: z.string().min(1),
  referralEscalationMinutes: z.coerce.number().int().min(1).max(10_080),
});

export interface NotificationView {
  id: string;
  eventType: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  readAt: string | null;
  deliveries: {
    channel: 'IN_APP' | 'SMS' | 'PUSH' | 'EMAIL';
    status: 'PENDING' | 'SENDING' | 'SENT' | 'DELIVERED' | 'UNCONFIGURED' | 'FAILED' | 'SKIPPED';
    error: string | null;
  }[];
}

export interface NotificationSettings {
  networkId: string;
  referralEscalationMinutes: number;
}
