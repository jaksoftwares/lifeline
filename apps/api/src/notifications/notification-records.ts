import { type NotificationChannel, type Prisma, type Role } from '@prisma/client';

const EXTERNAL_CHANNELS: NotificationChannel[] = ['SMS', 'PUSH', 'EMAIL'];

export interface NotifyRolesInput {
  networkId: string;
  institutionId: string | null;
  roles: Role[];
  eventType: string;
  eventKey: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
}

export async function createRoleNotifications(
  tx: Prisma.TransactionClient,
  input: NotifyRolesInput,
  emailConfigured = false,
): Promise<void> {
  if (input.roles.length === 0) return;
  const memberships = await tx.membership.findMany({
    where: {
      networkId: input.networkId,
      institutionId: input.institutionId,
      role: { in: input.roles },
      user: { status: 'ACTIVE' },
    },
    select: { userId: true, role: true },
    orderBy: { role: 'asc' },
  });
  const recipientRoles = new Map<string, Role>();
  for (const membership of memberships) {
    if (!recipientRoles.has(membership.userId)) {
      recipientRoles.set(membership.userId, membership.role);
    }
  }
  if (recipientRoles.size === 0) return;

  await tx.notification.createMany({
    data: [...recipientRoles].map(([userId, recipientRole]) => ({
      userId,
      networkId: input.networkId,
      institutionId: input.institutionId,
      recipientRole,
      eventType: input.eventType,
      eventKey: input.eventKey,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
    })),
    skipDuplicates: true,
  });

  const notifications = await tx.notification.findMany({
    where: { userId: { in: [...recipientRoles.keys()] }, eventKey: input.eventKey },
    select: { id: true },
  });
  await tx.notificationDelivery.createMany({
    data: notifications.flatMap(({ id }) => [
      { notificationId: id, channel: 'IN_APP', status: 'DELIVERED' as const },
      ...EXTERNAL_CHANNELS.map((channel) => ({
        notificationId: id,
        channel,
        status:
          channel === 'EMAIL' && emailConfigured ? ('PENDING' as const) : ('UNCONFIGURED' as const),
      })),
    ]),
    skipDuplicates: true,
  });
}
