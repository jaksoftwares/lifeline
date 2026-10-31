import { BadRequestException, Injectable } from '@nestjs/common';
import { capacityReportProblem } from '@lifeline/domain';
import { type CapacityEntry, type CapacityUpdateInput } from '@lifeline/schemas';
import { AuditService } from '../audit/audit.service';
import { assertPermission, type AuthContext } from '../auth/auth-context';
import { type FieldError } from '../common/zod.pipe';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { assertFacility, loadVisibleInstitution } from './facility-access';
import { byCatalogueOrder, resourcesInclude, toCapacityEntry } from './mappers';

@Injectable()
export class CapacityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records a batch of capacity reports. Each one is kept in the append-only history and becomes the
   * facility's current figure. Re-submitting unchanged values is how staff confirm figures are still right.
   */
  async report(
    auth: AuthContext,
    institutionId: string,
    input: CapacityUpdateInput,
    meta: RequestMeta,
  ): Promise<CapacityEntry[]> {
    const inst = await loadVisibleInstitution(this.prisma, auth, institutionId);
    assertFacility(inst);
    assertPermission(auth, 'capacity:update', {
      networkId: inst.networkId,
      institutionId: inst.id,
    });
    if (inst.status !== 'ACTIVE')
      throw new BadRequestException('Capacity can only be reported for active facilities.');

    const ids = input.reports.map((r) => r.resourceId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Each item can be reported once per update.');

    const tracked = await this.prisma.facilityResource.findMany({
      where: { institutionId, resourceId: { in: ids } },
      include: { resource: true },
    });
    const trackedById = new Map(tracked.map((t) => [t.resourceId, t]));

    const errors: FieldError[] = [];
    input.reports.forEach((report, index) => {
      const row = trackedById.get(report.resourceId);
      const problem = row
        ? capacityReportProblem(row.resource.kind, report)
        : 'This item is not tracked at this facility.';
      if (problem) errors.push({ path: `reports.${index}`, message: problem });
    });
    if (errors.length) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Some fields need attention.',
        errors,
      });
    }

    const recordedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const report of input.reports) {
        const values = {
          status: report.status,
          available: report.available ?? null,
          total: report.total ?? null,
          note: report.note ?? null,
          source: 'MANUAL' as const,
        };
        await tx.capacityUpdate.create({
          data: {
            ...values,
            institutionId,
            resourceId: report.resourceId,
            recordedById: auth.userId,
            recordedAt,
          },
        });
        await tx.facilityResource.update({
          where: { institutionId_resourceId: { institutionId, resourceId: report.resourceId } },
          data: { ...values, updatedAt: recordedAt, updatedById: auth.userId },
        });
      }
      await this.audit.record(
        {
          action: 'capacity.updated',
          entityType: 'institution',
          entityId: inst.id,
          actorId: auth.userId,
          networkId: inst.networkId,
          institutionId: inst.id,
          metadata: {
            items: input.reports.map((r) => ({
              resource: trackedById.get(r.resourceId)!.resource.code,
              status: r.status,
              available: r.available ?? null,
            })),
          },
          meta,
        },
        tx,
      );
    });

    const network = await this.prisma.network.findUniqueOrThrow({ where: { id: inst.networkId } });
    const rows = await this.prisma.facilityResource.findMany({
      where: { institutionId },
      ...resourcesInclude,
    });
    return rows
      .sort(byCatalogueOrder)
      .map((row) => toCapacityEntry(row, network.capacityStaleAfterMinutes, recordedAt));
  }
}
