import { z } from 'zod';

export const listAuditEventsQuerySchema = z.object({
  networkId: z.string().min(1),
  institutionId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export interface AuditEventView {
  id: string;
  action: string;
  occurredAt: string;
  actor: { id: string; fullName: string } | null;
  entityType: string;
  entityId: string | null;
  institution: { id: string; name: string } | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
