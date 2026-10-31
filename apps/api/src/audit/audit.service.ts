import { ForbiddenException, Injectable } from '@nestjs/common';
import { permittedInstitutionIds } from '@lifeline/domain';
import { type AuditEventView, type Page } from '@lifeline/schemas';
import { type Prisma } from '@prisma/client';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  /** Set for network and institution actions. Sign-in events leave it null and are scoped through the actor. */
  networkId?: string | null;
  institutionId?: string | null;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass a transaction client to write the audit record atomically with the change it describes. */
  async record(input: AuditInput, db: Db = this.prisma): Promise<void> {
    await db.auditEvent.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        actorId: input.actorId ?? null,
        networkId: input.networkId ?? null,
        institutionId: input.institutionId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonObject,
        ipAddress: input.meta?.ipAddress ?? null,
        userAgent: input.meta?.userAgent ?? null,
      },
    });
  }

  async list(
    auth: AuthContext,
    query: { networkId: string; institutionId?: string; cursor?: string; limit: number },
  ): Promise<Page<AuditEventView>> {
    const scope = permittedInstitutionIds(auth.grants, 'audit:view', query.networkId);
    if (scope !== 'ALL' && scope.length === 0) throw new ForbiddenException(NOT_PERMITTED);

    let institutionIds = scope;
    if (query.institutionId) {
      if (scope !== 'ALL' && !scope.includes(query.institutionId))
        throw new ForbiddenException(NOT_PERMITTED);
      institutionIds = [query.institutionId];
    }

    // Sign-in events carry no network; include those whose actor belongs to the scope being viewed.
    const where: Prisma.AuditEventWhereInput =
      institutionIds === 'ALL'
        ? {
            OR: [
              { networkId: query.networkId },
              { networkId: null, actor: { memberships: { some: { networkId: query.networkId } } } },
            ],
          }
        : {
            OR: [
              { institutionId: { in: institutionIds } },
              {
                networkId: null,
                actor: { memberships: { some: { institutionId: { in: institutionIds } } } },
              },
            ],
          };

    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        actor: { select: { id: true, fullName: true } },
        institution: { select: { id: true, name: true } },
      },
    });

    const items = rows.slice(0, query.limit);
    return {
      items: items.map((row) => ({
        id: row.id,
        action: row.action,
        occurredAt: row.occurredAt.toISOString(),
        actor: row.actor,
        entityType: row.entityType,
        entityId: row.entityId,
        institution: row.institution,
        ipAddress: row.ipAddress,
        metadata: row.metadata as Record<string, unknown>,
      })),
      nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }
}
