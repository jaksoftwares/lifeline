import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { permittedInstitutionIds } from '@lifeline/domain';
import {
  type NetworkSettings,
  type ReportMetric,
  type SuccessMetricsReport,
} from '@lifeline/schemas';
import PDFDocument from 'pdfkit';
import { type AuthContext, NOT_PERMITTED, assertPermission } from '../auth/auth-context';
import { AuditService } from '../audit/audit.service';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

interface ReportInput {
  networkId: string;
  from: string;
  to: string;
  institutionId?: string;
}

interface ReportPeriod {
  start: Date;
  end: Date;
}

interface DurationSample {
  from: Date | null;
  to: Date | null;
}

const METRIC_LABELS = {
  referralInitiationMinutes: 'Referral initiation',
  facilityAcceptanceMinutes: 'Facility acceptance',
  referralRejectionRate: 'Referral rejection rate',
  ambulanceAssignmentMinutes: 'Ambulance assignment',
  ambulanceResponseMinutes: 'Ambulance response',
  patientCollectionMinutes: 'Patient collection',
  transferDurationMinutes: 'Transfer duration',
  handoverCompletionRate: 'Handover completion rate',
  referralCompletionRate: 'Referral completion rate',
  ambulanceUtilisation: 'Ambulance utilisation',
  transferCostTotal: 'Recorded transfer costs',
  transferCostAverage: 'Average transfer cost',
  activeInstitutions: 'Active institutions',
  activeUsers: 'Active users',
} as const;

type MetricKey = keyof typeof METRIC_LABELS;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async successMetrics(auth: AuthContext, input: ReportInput): Promise<SuccessMetricsReport> {
    const { networkId, from, to } = input;
    const { scopeIds, institutionId } = await this.resolveScope(auth, input);
    const network = await this.prisma.network.findUnique({
      where: { id: networkId },
      select: { name: true, vehicleStatusStaleAfterMinutes: true },
    });
    if (!network) throw new NotFoundException('Network not found.');
    const period = reportPeriod(from, to);
    const dateRange = { gte: period.start, lt: period.end };
    const referralOriginScope = scopeIds ? { referringInstitutionId: { in: scopeIds } } : {};
    const referralAcceptanceScope = scopeIds
      ? {
          OR: [
            { referringInstitutionId: { in: scopeIds } },
            { acceptedRequest: { institutionId: { in: scopeIds } } },
          ],
        }
      : {};
    const transferScope = scopeIds
      ? {
          OR: [
            { pickupInstitutionId: { in: scopeIds } },
            { destinationInstitutionId: { in: scopeIds } },
            { assignments: { some: { providerId: { in: scopeIds } } } },
          ],
        }
      : {};
    const referralRequestScope = scopeIds
      ? {
          OR: [
            { institutionId: { in: scopeIds } },
            { referral: { referringInstitutionId: { in: scopeIds } } },
          ],
        }
      : {};
    const transferFilter = { networkId, ...transferScope };

    const [
      initiated,
      accepted,
      requests,
      transfers,
      arrivedTransfers,
      submittedReferrals,
      costs,
      referralActivity,
      transferActivity,
      activeInstitutions,
      allActiveUsers,
      activeUserCount,
      vehicleUtilisation,
    ] = await Promise.all([
      this.prisma.referral.findMany({
        where: {
          networkId,
          createdAt: dateRange,
          submittedAt: { not: null },
          ...referralOriginScope,
        },
        select: { createdAt: true, submittedAt: true },
      }),
      this.prisma.referral.findMany({
        where: {
          networkId,
          acceptedAt: dateRange,
          submittedAt: { not: null },
          ...referralAcceptanceScope,
        },
        select: { submittedAt: true, acceptedAt: true },
      }),
      this.prisma.referralRequest.findMany({
        where: {
          sentAt: dateRange,
          referral: { networkId },
          ...referralRequestScope,
        },
        select: { status: true, respondedAt: true },
      }),
      this.prisma.transfer.findMany({
        where: {
          ...transferFilter,
          OR: [
            { requestedAt: dateRange },
            { dispatchedAt: dateRange },
            { atPickupAt: dateRange },
            { collectedAt: dateRange },
          ],
        },
        select: {
          requestedAt: true,
          assignedAt: true,
          dispatchedAt: true,
          atPickupAt: true,
          collectedAt: true,
          arrivedAt: true,
        },
      }),
      this.prisma.transfer.findMany({
        where: { ...transferFilter, arrivedAt: dateRange },
        select: { handover: { select: { id: true } } },
      }),
      this.prisma.referral.findMany({
        where: {
          networkId,
          submittedAt: dateRange,
          ...referralOriginScope,
        },
        select: { transfers: { where: { completedAt: { not: null } }, select: { id: true } } },
      }),
      this.prisma.transferCost.findMany({
        where: { recordedAt: dateRange, transfer: transferFilter },
        select: { amount: true },
      }),
      this.prisma.referralEvent.findMany({
        where: {
          occurredAt: dateRange,
          referral: { networkId },
          ...(scopeIds ? { institutionId: { in: scopeIds } } : {}),
        },
        select: { institutionId: true },
      }),
      this.prisma.transferEvent.findMany({
        where: {
          occurredAt: dateRange,
          transfer: { networkId },
          ...(scopeIds ? { institutionId: { in: scopeIds } } : {}),
        },
        select: { institutionId: true },
      }),
      this.prisma.institution.findMany({
        where: {
          networkId,
          status: 'ACTIVE',
          ...(scopeIds ? { id: { in: scopeIds } } : {}),
        },
        select: { id: true, name: true },
      }),
      this.prisma.user.count({
        where: {
          status: 'ACTIVE',
          memberships: {
            some: {
              networkId,
              ...(scopeIds ? { institutionId: { in: scopeIds } } : {}),
            },
          },
        },
      }),
      this.prisma.user.count({
        where: {
          status: 'ACTIVE',
          lastLoginAt: dateRange,
          memberships: {
            some: {
              networkId,
              ...(scopeIds ? { institutionId: { in: scopeIds } } : {}),
            },
          },
        },
      }),
      this.getVehicleUtilisation(
        networkId,
        scopeIds,
        period,
        network.vehicleStatusStaleAfterMinutes,
      ),
    ]);

    const declined = requests.filter(
      (request) =>
        request.status === 'DECLINED' &&
        request.respondedAt !== null &&
        request.respondedAt >= period.start &&
        request.respondedAt < period.end,
    ).length;
    const arrivedCount = arrivedTransfers.length;
    const costsTotal = costs.reduce((total, cost) => total + cost.amount.toNumber(), 0);
    const activeInstitutionIds = new Set(
      [...referralActivity, ...transferActivity]
        .map((event) => event.institutionId)
        .filter(
          (id): id is string =>
            id !== null && activeInstitutions.some((institution) => institution.id === id),
        ),
    );
    const submittedCount = submittedReferrals.length;
    const completedCount = submittedReferrals.filter(
      (referral) => referral.transfers.length > 0,
    ).length;
    const durationMetric = (samples: DurationSample[]): ReportMetric => averageDuration(samples);
    const metrics: SuccessMetricsReport['metrics'] = {
      referralInitiationMinutes: durationMetric(
        initiated.map((referral) => ({ from: referral.createdAt, to: referral.submittedAt })),
      ),
      facilityAcceptanceMinutes: durationMetric(
        accepted.map((referral) => ({ from: referral.submittedAt, to: referral.acceptedAt })),
      ),
      referralRejectionRate: ratioMetric(declined, requests.length),
      ambulanceAssignmentMinutes: durationMetric(
        transfers.map((transfer) => ({ from: transfer.requestedAt, to: transfer.assignedAt })),
      ),
      ambulanceResponseMinutes: durationMetric(
        transfers.map((transfer) => ({ from: transfer.dispatchedAt, to: transfer.atPickupAt })),
      ),
      patientCollectionMinutes: durationMetric(
        transfers.map((transfer) => ({ from: transfer.atPickupAt, to: transfer.collectedAt })),
      ),
      transferDurationMinutes: durationMetric(
        transfers.map((transfer) => ({ from: transfer.collectedAt, to: transfer.arrivedAt })),
      ),
      handoverCompletionRate: ratioMetric(
        arrivedTransfers.filter((transfer) => transfer.handover !== null).length,
        arrivedCount,
      ),
      referralCompletionRate: ratioMetric(completedCount, submittedCount),
      ambulanceUtilisation: ratioMetric(
        vehicleUtilisation.assignedMs / 60_000,
        vehicleUtilisation.availableMs / 60_000,
        100,
      ),
      transferCostTotal: {
        value: round(costsTotal, 2),
        unit: 'currency',
        numerator: round(costsTotal, 2),
        denominator: costs.length,
      },
      transferCostAverage: {
        value: costs.length ? round(costsTotal / costs.length, 2) : null,
        unit: 'currency',
        numerator: round(costsTotal, 2),
        denominator: costs.length,
      },
      activeInstitutions: countMetric(activeInstitutionIds.size, activeInstitutions.length),
      activeUsers: countMetric(activeUserCount, allActiveUsers),
    };

    return {
      networkId,
      networkName: network.name,
      from,
      to,
      institutionId,
      institutionName: institutionId
        ? (activeInstitutions.find((i) => i.id === institutionId)?.name ??
          (
            await this.prisma.institution.findUniqueOrThrow({
              where: { id: institutionId },
              select: { name: true },
            })
          ).name)
        : null,
      generatedAt: new Date().toISOString(),
      metrics,
    };
  }

  async networkSettings(auth: AuthContext, networkId: string): Promise<NetworkSettings> {
    assertPermission(auth, 'network:configure', { networkId });
    const network = await this.prisma.network.findUnique({
      where: { id: networkId },
      select: {
        id: true,
        capacityStaleAfterMinutes: true,
        vehicleStatusStaleAfterMinutes: true,
        earlyWarningScore: true,
      },
    });
    if (!network) throw new NotFoundException('Network not found.');
    return {
      networkId: network.id,
      capacityStaleAfterMinutes: network.capacityStaleAfterMinutes,
      vehicleStatusStaleAfterMinutes: network.vehicleStatusStaleAfterMinutes,
      earlyWarningScore: network.earlyWarningScore,
    };
  }

  async updateNetworkSettings(
    auth: AuthContext,
    input: NetworkSettings,
    meta: RequestMeta,
  ): Promise<NetworkSettings> {
    assertPermission(auth, 'network:configure', { networkId: input.networkId });
    const existing = await this.prisma.network.findUnique({
      where: { id: input.networkId },
      select: {
        id: true,
        capacityStaleAfterMinutes: true,
        vehicleStatusStaleAfterMinutes: true,
        earlyWarningScore: true,
      },
    });
    if (!existing) throw new NotFoundException('Network not found.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.network.update({
        where: { id: input.networkId },
        data: {
          capacityStaleAfterMinutes: input.capacityStaleAfterMinutes,
          vehicleStatusStaleAfterMinutes: input.vehicleStatusStaleAfterMinutes,
          earlyWarningScore: input.earlyWarningScore,
        },
        select: {
          id: true,
          capacityStaleAfterMinutes: true,
          vehicleStatusStaleAfterMinutes: true,
          earlyWarningScore: true,
        },
      });
      await this.audit.record(
        {
          action: 'network.settings_updated',
          entityType: 'network',
          entityId: saved.id,
          actorId: auth.userId,
          networkId: saved.id,
          metadata: {
            previous: {
              capacityStaleAfterMinutes: existing.capacityStaleAfterMinutes,
              vehicleStatusStaleAfterMinutes: existing.vehicleStatusStaleAfterMinutes,
              earlyWarningScore: existing.earlyWarningScore,
            },
            current: {
              capacityStaleAfterMinutes: saved.capacityStaleAfterMinutes,
              vehicleStatusStaleAfterMinutes: saved.vehicleStatusStaleAfterMinutes,
              earlyWarningScore: saved.earlyWarningScore,
            },
          },
          meta,
        },
        tx,
      );
      return saved;
    });
    return {
      networkId: updated.id,
      capacityStaleAfterMinutes: updated.capacityStaleAfterMinutes,
      vehicleStatusStaleAfterMinutes: updated.vehicleStatusStaleAfterMinutes,
      earlyWarningScore: updated.earlyWarningScore,
    };
  }

  async csv(auth: AuthContext, input: ReportInput): Promise<{ filename: string; data: string }> {
    const report = await this.successMetrics(auth, input);
    const rows = [
      ['section', 'metric', 'name', 'value', 'unit', 'numerator', 'denominator'],
      ['report', '', 'Network', report.networkName, '', '', ''],
      ['report', '', 'From', report.from, '', '', ''],
      ['report', '', 'To', report.to, '', '', ''],
      [
        'report',
        '',
        'Institution',
        report.institutionName ?? 'All in authorised scope',
        '',
        '',
        '',
      ],
      ...Object.entries(report.metrics).map(([key, metric]) => [
        'metric',
        key,
        METRIC_LABELS[key as MetricKey],
        metric.value === null ? '' : String(metric.value),
        metric.unit,
        String(metric.numerator),
        String(metric.denominator),
      ]),
    ];
    return {
      filename: `lifeline-success-metrics-${report.from}-to-${report.to}.csv`,
      data: rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n',
    };
  }

  async pdf(auth: AuthContext, input: ReportInput): Promise<{ filename: string; data: Buffer }> {
    const report = await this.successMetrics(auth, input);
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: 'Lifeline success metrics' },
    });
    const chunks: Buffer[] = [];
    const pdf = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#123047')
      .text('Lifeline', { continued: true });
    doc.font('Helvetica').fontSize(20).fillColor('#087f8c').text('  Success metrics');
    doc.moveDown(0.5).fontSize(10).fillColor('#475569');
    doc.text(
      `Network: ${report.networkName}${report.institutionName ? ` · ${report.institutionName}` : ''}`,
    );
    doc.text(`Reporting period: ${report.from} to ${report.to} (Africa/Nairobi)`);
    doc.text(
      `Generated: ${new Date(report.generatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })}`,
    );
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#123047');
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    doc.text('Measure', left, doc.y, { continued: true, width: 300 });
    doc.text('Result', left + 310, doc.y - 13, { width: right - left - 310, align: 'right' });
    doc
      .moveTo(left, doc.y + 5)
      .lineTo(right, doc.y + 5)
      .strokeColor('#cbd5e1')
      .stroke();
    doc.y += 14;
    for (const [key, metric] of Object.entries(report.metrics)) {
      const label = METRIC_LABELS[key as MetricKey];
      const value = formatMetric(metric);
      const detail = metricDetail(key as MetricKey, metric);
      if (doc.y > doc.page.height - doc.page.margins.bottom - 42) {
        doc.addPage();
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#123047')
          .text('Success metrics (continued)');
        doc.moveDown(0.7);
      }
      const rowY = doc.y;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#123047').text(label, left, rowY, {
        width: 300,
      });
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#087f8c')
        .text(value, left + 310, rowY, {
          width: right - left - 310,
          align: 'right',
        });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text(detail, left, rowY + 15);
      doc
        .moveTo(left, rowY + 32)
        .lineTo(right, rowY + 32)
        .strokeColor('#e2e8f0')
        .stroke();
      doc.y = rowY + 40;
    }
    doc
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#64748b')
      .text(
        'Timing averages use records with both timestamps. Adoption counts active institutions with recorded referral or transfer activity and active users who signed in during the period. Utilisation is assigned minutes divided by recorded available-fleet minutes. Missing historical vehicle status is not inferred.',
        { width: right - left },
      );
    doc.end();
    return {
      filename: `lifeline-success-metrics-${report.from}-to-${report.to}.pdf`,
      data: await pdf,
    };
  }

  private async resolveScope(
    auth: AuthContext,
    input: ReportInput,
  ): Promise<{ scopeIds: string[] | null; institutionId: string | null }> {
    const scope = permittedInstitutionIds(auth.grants, 'reports:view', input.networkId);
    if (scope !== 'ALL' && scope.length === 0) throw new ForbiddenException(NOT_PERMITTED);
    let institutionId: string | null = null;
    if (input.institutionId) {
      if (scope !== 'ALL' && !scope.includes(input.institutionId))
        throw new ForbiddenException(NOT_PERMITTED);
      const institution = await this.prisma.institution.findFirst({
        where: { id: input.institutionId, networkId: input.networkId },
        select: { id: true },
      });
      if (!institution) throw new NotFoundException('Institution not found.');
      institutionId = institution.id;
    }
    return {
      scopeIds: institutionId !== null ? [institutionId] : scope === 'ALL' ? null : scope,
      institutionId,
    };
  }

  private async getVehicleUtilisation(
    networkId: string,
    scopeIds: string[] | null,
    period: ReportPeriod,
    staleAfterMinutes: number,
  ): Promise<{ availableMs: number; assignedMs: number }> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        networkId,
        ...(scopeIds ? { institutionId: { in: scopeIds } } : {}),
      },
      select: { id: true },
    });
    if (vehicles.length === 0) return { availableMs: 0, assignedMs: 0 };
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const [priorDates, periodEvents] = await Promise.all([
      this.prisma.vehicleStatusEvent.groupBy({
        by: ['vehicleId'],
        where: { vehicleId: { in: vehicleIds }, recordedAt: { lt: period.start } },
        _max: { recordedAt: true },
      }),
      this.prisma.vehicleStatusEvent.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          recordedAt: { gte: period.start, lt: period.end },
        },
        orderBy: [{ vehicleId: 'asc' }, { recordedAt: 'asc' }, { id: 'asc' }],
        select: { vehicleId: true, status: true, recordStatus: true, recordedAt: true },
      }),
    ]);
    const priorEvents = await this.prisma.vehicleStatusEvent.findMany({
      where: {
        OR: priorDates.flatMap(({ vehicleId, _max }) =>
          _max.recordedAt ? [{ vehicleId, recordedAt: _max.recordedAt }] : [],
        ),
      },
      orderBy: [{ vehicleId: 'asc' }, { recordedAt: 'asc' }, { id: 'asc' }],
      select: { vehicleId: true, status: true, recordStatus: true, recordedAt: true },
    });
    const events = [...priorEvents, ...periodEvents];
    const assignments = await this.prisma.dispatchAssignment.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        status: { in: ['CONFIRMED', 'COMPLETED', 'RELEASED'] },
        respondedAt: { lt: period.end },
        OR: [{ endedAt: null }, { endedAt: { gt: period.start } }],
      },
      select: { vehicleId: true, respondedAt: true, endedAt: true },
    });

    let availableMs = 0;
    let assignedMs = 0;
    for (const vehicleId of vehicleIds) {
      const timeline = events.filter((event) => event.vehicleId === vehicleId);
      let state = timeline.filter((event) => event.recordedAt < period.start).at(-1);
      let cursor = period.start.getTime();
      const availableIntervals: [number, number][] = [];
      for (const event of timeline.filter((item) => item.recordedAt >= period.start)) {
        const eventTime = Math.min(event.recordedAt.getTime(), period.end.getTime());
        const freshUntil = state ? state.recordedAt.getTime() + staleAfterMinutes * 60_000 : cursor;
        if (
          state?.recordStatus === 'ACTIVE' &&
          state.status === 'AVAILABLE' &&
          eventTime > cursor
        ) {
          const intervalEnd = Math.min(eventTime, freshUntil);
          if (intervalEnd > cursor) availableIntervals.push([cursor, intervalEnd]);
        }
        state = event;
        cursor = eventTime;
      }
      const freshUntil = state ? state.recordedAt.getTime() + staleAfterMinutes * 60_000 : cursor;
      if (
        state?.recordStatus === 'ACTIVE' &&
        state.status === 'AVAILABLE' &&
        period.end.getTime() > cursor
      ) {
        const intervalEnd = Math.min(period.end.getTime(), freshUntil);
        if (intervalEnd > cursor) availableIntervals.push([cursor, intervalEnd]);
      }

      const vehicleAssignments = assignments.filter(
        (assignment) => assignment.vehicleId === vehicleId,
      );
      for (const [start, end] of availableIntervals) {
        availableMs += end - start;
        for (const assignment of vehicleAssignments) {
          if (!assignment.respondedAt) continue;
          assignedMs += Math.max(
            0,
            Math.min(end, assignment.endedAt?.getTime() ?? period.end.getTime()) -
              Math.max(start, assignment.respondedAt.getTime()),
          );
        }
      }
    }
    return { availableMs, assignedMs };
  }
}

function reportPeriod(from: string, to: string): ReportPeriod {
  const start = localDateStart(from);
  const nextDay = new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  return { start, end: localDateStart(nextDay) };
}

function localDateStart(value: string): Date {
  return new Date(Date.parse(`${value}T00:00:00Z`) - NAIROBI_OFFSET_MS);
}

function averageDuration(samples: DurationSample[]): ReportMetric {
  const minutes = samples.flatMap(({ from, to }) =>
    from && to && to >= from ? [(to.getTime() - from.getTime()) / 60_000] : [],
  );
  const total = minutes.reduce((sum, value) => sum + value, 0);
  return {
    value: minutes.length ? round(total / minutes.length, 1) : null,
    unit: 'minutes',
    numerator: minutes.length ? round(total, 1) : 0,
    denominator: minutes.length,
  };
}

function ratioMetric(numerator: number, denominator: number, scale = 100): ReportMetric {
  return {
    value: denominator ? round((numerator / denominator) * scale, 1) : null,
    unit: 'percent',
    numerator: round(numerator, 1),
    denominator: round(denominator, 1),
  };
}

function countMetric(value: number, denominator: number): ReportMetric {
  return { value, unit: 'count', numerator: value, denominator };
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function formatMetric(metric: ReportMetric): string {
  if (metric.value === null) return 'No data';
  switch (metric.unit) {
    case 'minutes':
      return `${metric.value.toLocaleString()} min`;
    case 'percent':
      return `${metric.value.toLocaleString()}%`;
    case 'currency':
      return `KES ${metric.value.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    case 'count':
      return metric.value.toLocaleString();
  }
}

function metricDetail(key: MetricKey, metric: ReportMetric): string {
  const numerator = metric.numerator.toLocaleString();
  const denominator = metric.denominator.toLocaleString();
  if (metric.denominator === 0) return 'No completed observations in this period';
  switch (key) {
    case 'referralInitiationMinutes':
    case 'facilityAcceptanceMinutes':
    case 'ambulanceAssignmentMinutes':
    case 'ambulanceResponseMinutes':
    case 'patientCollectionMinutes':
    case 'transferDurationMinutes':
      return `Average across ${denominator} completed observation${metric.denominator === 1 ? '' : 's'}`;
    case 'referralRejectionRate':
    case 'handoverCompletionRate':
    case 'referralCompletionRate':
      return `${numerator} of ${denominator} records`;
    case 'ambulanceUtilisation':
      return `${numerator} assigned minutes / ${denominator} available minutes`;
    case 'transferCostTotal':
      return `${denominator} cost record${metric.denominator === 1 ? '' : 's'}`;
    case 'transferCostAverage':
      return `Average across ${denominator} cost record${metric.denominator === 1 ? '' : 's'}`;
    case 'activeInstitutions':
      return `${numerator} of ${denominator} currently active institutions`;
    case 'activeUsers':
      return `${numerator} of ${denominator} currently active users`;
  }
}
