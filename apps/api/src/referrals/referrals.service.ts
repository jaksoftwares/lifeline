import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  hasPermission,
  isOpenRequest,
  MAX_RECEIVING_FACILITIES,
  OPEN_REQUEST_STATUSES,
  permittedInstitutionIds,
  scoreNotApplicableReason,
} from '@lifeline/domain';
import {
  type CreateReferralInput,
  type ListReferralsQuery,
  type PatientInput,
  type ReferralDetail,
  type ReferralSummary,
  type RequestView,
  type UpdateReferralDraftInput,
} from '@lifeline/schemas';
import { Prisma, type Referral } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { assertPermission, type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { type FieldError } from '../common/zod.pipe';
import { type RequestMeta } from '../common/request-meta';
import { toServiceView } from '../facilities/mappers';
import { PrismaService } from '../prisma/prisma.service';
import {
  attachmentSelect,
  nextAction,
  patientAge,
  summaryInclude,
  toAssessmentView,
  toAttachmentView,
  toEventView,
  toMessageView,
  toPatientView,
  toReferralSummary,
} from './mappers';
import {
  assertCanView,
  assertReferrer,
  type ReferralAccess,
  referralAccess,
} from './referral-access';
import { nextReferralReference, recordReferralEvent } from './referral-records';
import { cancelOpenTransfer } from '../transport/transfer-records';

const VIEW_AUDIT_INTERVAL_MS = 15 * 60 * 1000;
const LIST_LIMIT = 100;

const person = { select: { id: true, fullName: true } } as const;

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    auth: AuthContext,
    input: CreateReferralInput,
    meta: RequestMeta,
  ): Promise<{ id: string; reference: string }> {
    const institution = await this.prisma.institution.findUnique({
      where: { id: input.referringInstitutionId },
    });
    if (!institution || institution.type !== 'FACILITY')
      throw new BadRequestException('Choose your facility.');
    assertPermission(auth, 'referral:create', {
      networkId: institution.networkId,
      institutionId: institution.id,
    });
    await this.assertServicesInNetwork(input.requiredServiceIds ?? [], institution.networkId);

    const referral = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: { ...patientData(input.patient), networkId: institution.networkId },
      });
      const created = await tx.referral.create({
        data: {
          networkId: institution.networkId,
          reference: await nextReferralReference(tx, institution.networkId),
          referringInstitutionId: institution.id,
          createdById: auth.userId,
          patientId: patient.id,
          ...clinicalData(input),
          requiredServices: {
            create: (input.requiredServiceIds ?? []).map((serviceId) => ({ serviceId })),
          },
        },
      });
      await recordReferralEvent(tx, {
        referralId: created.id,
        type: 'CREATED',
        actorId: auth.userId,
        institutionId: institution.id,
      });
      await this.audit.record(
        {
          action: 'referral.created',
          entityType: 'referral',
          entityId: created.id,
          actorId: auth.userId,
          networkId: institution.networkId,
          institutionId: institution.id,
          metadata: { reference: created.reference },
          meta,
        },
        tx,
      );
      return created;
    });
    return { id: referral.id, reference: referral.reference };
  }

  async updateDraft(
    auth: AuthContext,
    referralId: string,
    input: UpdateReferralDraftInput,
  ): Promise<void> {
    const { referral, access } = await this.load(auth, referralId);
    assertReferrer(access);
    if (referral.status !== 'DRAFT') {
      throw new ConflictException(
        'This referral has been sent. Add observations or send a message instead.',
      );
    }
    if (input.requiredServiceIds)
      await this.assertServicesInNetwork(input.requiredServiceIds, referral.networkId);

    await this.prisma.$transaction(async (tx) => {
      if (input.patient)
        await tx.patient.update({
          where: { id: referral.patientId },
          data: patientData(input.patient),
        });
      await tx.referral.update({
        where: { id: referralId },
        data: {
          ...clinicalData(input),
          ...(input.requiredServiceIds
            ? {
                requiredServices: {
                  deleteMany: {},
                  create: input.requiredServiceIds.map((serviceId) => ({ serviceId })),
                },
              }
            : {}),
        },
      });
    });
  }

  async submit(
    auth: AuthContext,
    referralId: string,
    institutionIds: string[],
    meta: RequestMeta,
  ): Promise<void> {
    const { referral, access } = await this.load(auth, referralId);
    assertReferrer(access);
    if (referral.status !== 'DRAFT')
      throw new ConflictException('This referral has already been sent.');

    const missing: FieldError[] = [];
    if (!referral.urgency) missing.push({ path: 'urgency', message: 'Choose the urgency.' });
    if (!referral.reason)
      missing.push({ path: 'reason', message: 'Give the reason for referral.' });
    if (!referral.clinicalSummary)
      missing.push({ path: 'clinicalSummary', message: 'Summarise the patient’s condition.' });
    if (missing.length) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Complete the referral before sending it.',
        errors: missing,
      });
    }
    await this.assertReceivingFacilities(institutionIds, referral);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.referral.updateMany({
        where: { id: referralId, status: 'DRAFT' },
        data: { status: 'SUBMITTED', submittedAt: now },
      });
      if (count === 0) throw new ConflictException('This referral has already been sent.');
      await recordReferralEvent(tx, {
        referralId,
        type: 'SUBMITTED',
        actorId: auth.userId,
        institutionId: referral.referringInstitutionId,
        at: now,
      });
      await this.createRequests(
        tx,
        auth,
        referral.id,
        referral.referringInstitutionId,
        institutionIds,
        now,
      );
      await this.audit.record(
        {
          action: 'referral.submitted',
          entityType: 'referral',
          entityId: referralId,
          actorId: auth.userId,
          networkId: referral.networkId,
          institutionId: referral.referringInstitutionId,
          metadata: { reference: referral.reference, recipients: institutionIds.length },
          meta,
        },
        tx,
      );
    });
  }

  /** Send to more facilities, typically after the first ones declined. */
  async addRequests(
    auth: AuthContext,
    referralId: string,
    institutionIds: string[],
    meta: RequestMeta,
  ): Promise<void> {
    const { referral, access } = await this.load(auth, referralId);
    assertReferrer(access);
    if (referral.status !== 'SUBMITTED') {
      throw new ConflictException(
        'Facilities can be added only while the referral is awaiting a response.',
      );
    }
    const alreadyAsked = referral.requests.filter((r) => institutionIds.includes(r.institutionId));
    if (alreadyAsked.length) {
      throw new ConflictException(
        `Already sent to ${alreadyAsked.map((r) => r.institution.name).join(', ')}.`,
      );
    }
    const open = referral.requests.filter((r) => isOpenRequest(r.status)).length;
    if (open + institutionIds.length > MAX_RECEIVING_FACILITIES) {
      throw new BadRequestException(
        `No more than ${MAX_RECEIVING_FACILITIES} facilities can be considering a referral at once.`,
      );
    }
    await this.assertReceivingFacilities(institutionIds, referral);

    await this.prisma.$transaction(async (tx) => {
      await this.createRequests(
        tx,
        auth,
        referral.id,
        referral.referringInstitutionId,
        institutionIds,
        new Date(),
      );
      await this.audit.record(
        {
          action: 'referral.requests_added',
          entityType: 'referral',
          entityId: referralId,
          actorId: auth.userId,
          networkId: referral.networkId,
          institutionId: referral.referringInstitutionId,
          metadata: { reference: referral.reference, recipients: institutionIds.length },
          meta,
        },
        tx,
      );
    });
  }

  async withdrawRequest(
    auth: AuthContext,
    requestId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    const request = await this.prisma.referralRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Request not found.');
    const { referral, access } = await this.load(auth, request.referralId);
    assertReferrer(access);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.referralRequest.updateMany({
        where: { id: requestId, status: { in: [...OPEN_REQUEST_STATUSES] } },
        data: { status: 'WITHDRAWN', withdrawnAt: new Date(), withdrawReason: reason },
      });
      if (count === 0)
        throw new ConflictException('Only requests still awaiting an answer can be withdrawn.');
      await recordReferralEvent(tx, {
        referralId: referral.id,
        type: 'WITHDRAWN',
        actorId: auth.userId,
        institutionId: request.institutionId,
        requestId,
        note: reason,
      });
      await this.auditReferral(tx, auth, referral, 'referral.request_withdrawn', meta, {
        requestId,
      });
    });
  }

  async cancel(
    auth: AuthContext,
    referralId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    const { referral, access } = await this.load(auth, referralId);
    assertReferrer(access);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.referral.updateMany({
        where: { id: referralId, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason },
      });
      if (count === 0) throw new ConflictException('This referral is already cancelled.');
      await tx.referralRequest.updateMany({
        where: { referralId, status: { in: [...OPEN_REQUEST_STATUSES] } },
        data: { status: 'WITHDRAWN', withdrawnAt: now, withdrawReason: 'Referral cancelled' },
      });
      // Any ambulance offered or on its way is stood down; refused once the patient is collected.
      await cancelOpenTransfer(tx, {
        referralId,
        actorId: auth.userId,
        institutionId: referral.referringInstitutionId,
        reason: `Referral cancelled: ${reason}`,
        at: now,
      });
      await recordReferralEvent(tx, {
        referralId,
        type: 'CANCELLED',
        actorId: auth.userId,
        institutionId: referral.referringInstitutionId,
        note: reason,
        at: now,
      });
      await this.auditReferral(tx, auth, referral, 'referral.cancelled', meta);
    });
  }

  async list(auth: AuthContext, query: ListReferralsQuery): Promise<ReferralSummary[]> {
    const { networkId, box } = query;
    const scope = permittedInstitutionIds(auth.grants, 'referral:view', networkId);
    if (scope !== 'ALL' && scope.length === 0) throw new ForbiddenException(NOT_PERMITTED);

    let where: Prisma.ReferralWhereInput;
    if (box === 'network') {
      if (scope !== 'ALL') throw new ForbiddenException(NOT_PERMITTED);
      where = { networkId, status: query.open ? 'SUBMITTED' : { not: 'DRAFT' } };
    } else {
      // Network-wide roles see everything through the "network" box; here only institution roles count.
      const ids = scope === 'ALL' ? [] : scope;
      if (box === 'outgoing') {
        where = {
          networkId,
          referringInstitutionId: { in: ids },
          ...(query.open ? { status: { in: ['DRAFT', 'SUBMITTED'] } } : {}),
        };
      } else {
        where = {
          networkId,
          status: { not: 'DRAFT' },
          requests: {
            some: {
              institutionId: { in: ids },
              ...(query.open ? { status: { in: [...OPEN_REQUEST_STATUSES] } } : {}),
            },
          },
          ...(query.open ? { status: 'SUBMITTED' } : {}),
        };
      }
    }
    if (query.status) where = { AND: [where, { status: query.status }] };

    const referrals = await this.prisma.referral.findMany({
      where,
      include: summaryInclude,
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
    });

    return referrals.map((r) => {
      const access = referralAccess(auth, r);
      const visible = access.seesAllRequests
        ? r.requests
        : r.requests.filter((q) => access.receivingRequestIds.includes(q.id));
      return toReferralSummary(r, visible, nextAction(r, access));
    });
  }

  async detail(auth: AuthContext, referralId: string, meta: RequestMeta): Promise<ReferralDetail> {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        network: true,
        patient: true,
        referringInstitution: { select: { id: true, name: true, phone: true } },
        createdBy: person,
        requiredServices: { include: { service: true } },
        assessments: { include: { recordedBy: person }, orderBy: { observedAt: 'desc' } },
        attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' } },
        requests: {
          orderBy: { sentAt: 'asc' },
          include: {
            institution: { select: { id: true, name: true, phone: true } },
            sentBy: person,
            respondedBy: person,
            receivingDepartment: { select: { id: true, name: true, phone: true } },
            messages: {
              orderBy: { createdAt: 'asc' },
              include: { author: person, authorInstitution: { select: { id: true, name: true } } },
            },
          },
        },
        events: {
          orderBy: { occurredAt: 'asc' },
          include: { actor: person, institution: { select: { id: true, name: true } } },
        },
        transfers: { where: { status: { not: 'CANCELLED' } }, select: { id: true } },
      },
    });
    if (!referral) throw new NotFoundException('Referral not found.');
    const access = referralAccess(auth, referral);
    assertCanView(access);
    if (referral.status === 'DRAFT' && !access.referrerView)
      throw new NotFoundException('Referral not found.');
    await this.auditView(auth, referral, meta);

    const visibleRequests = access.seesAllRequests
      ? referral.requests
      : referral.requests.filter((r) => access.receivingRequestIds.includes(r.id));
    const visibleRequestIds = new Set(visibleRequests.map((r) => r.id));
    const departments = await this.departmentsForResponders(visibleRequests, access);

    const requests: RequestView[] = visibleRequests.map((r) => ({
      id: r.id,
      institution: { id: r.institution.id, name: r.institution.name },
      institutionPhone: r.institution.phone,
      status: r.status,
      sentAt: r.sentAt.toISOString(),
      sentBy: r.sentBy,
      respondedAt: r.respondedAt?.toISOString() ?? null,
      respondedBy: r.respondedBy,
      declineReason: r.declineReason,
      responseNote: r.responseNote,
      receivingDepartment: r.receivingDepartment,
      readyAt: r.readyAt?.toISOString() ?? null,
      withdrawnAt: r.withdrawnAt?.toISOString() ?? null,
      withdrawReason: r.withdrawReason,
      messages: r.messages.map(toMessageView),
      ...(departments.has(r.institutionId)
        ? { departments: departments.get(r.institutionId) }
        : {}),
    }));

    const messageableRequestIds = visibleRequests
      .filter(
        (r) =>
          r.status !== 'DECLINED' && r.status !== 'WITHDRAWN' && referral.status !== 'CANCELLED',
      )
      .filter((r) => access.isReferrer || access.receivingRequestIds.includes(r.id))
      .map((r) => r.id);

    return {
      id: referral.id,
      reference: referral.reference,
      networkId: referral.networkId,
      status: referral.status,
      urgency: referral.urgency,
      referringInstitution: referral.referringInstitution,
      createdBy: referral.createdBy,
      createdAt: referral.createdAt.toISOString(),
      submittedAt: referral.submittedAt?.toISOString() ?? null,
      acceptedAt: referral.acceptedAt?.toISOString() ?? null,
      cancelledAt: referral.cancelledAt?.toISOString() ?? null,
      cancelReason: referral.cancelReason,
      patient: toPatientView(referral.patient),
      pregnancyStatus: referral.pregnancyStatus,
      gestationWeeks: referral.gestationWeeks,
      reason: referral.reason,
      clinicalSummary: referral.clinicalSummary,
      provisionalDiagnosis: referral.provisionalDiagnosis,
      treatmentGiven: referral.treatmentGiven,
      allergies: referral.allergies,
      requiredServices: referral.requiredServices.map((rs) => toServiceView(rs.service)),
      assessments: referral.assessments.map(toAssessmentView),
      attachments: referral.attachments.map(toAttachmentView),
      requests,
      // Receiving facilities see referral-wide events and those about their own request.
      events: referral.events
        .filter(
          (e) =>
            access.seesAllRequests || e.requestId === null || visibleRequestIds.has(e.requestId),
        )
        .map(toEventView),
      scoring: {
        score: referral.network.earlyWarningScore,
        notApplicableReason:
          referral.network.earlyWarningScore === 'NONE'
            ? null
            : scoreNotApplicableReason({
                ageYears: patientAge(referral.patient),
                pregnancyStatus: referral.pregnancyStatus,
              }),
      },
      transferId: referral.transfers[0]?.id ?? null,
      viewer: {
        canArrangeTransport: hasPermission(auth.grants, 'transport:request', {
          networkId: referral.networkId,
          institutionId: referral.referringInstitutionId,
        }),
        isReferrer: access.isReferrer,
        respondableRequestIds: access.respondableRequestIds.filter((id) =>
          visibleRequestIds.has(id),
        ),
        messageableRequestIds,
      },
    };
  }

  /** Loads a referral with its requests and the viewer's relationship to it. */
  async load(auth: AuthContext, referralId: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: { requests: { include: { institution: { select: { id: true, name: true } } } } },
    });
    if (!referral) throw new NotFoundException('Referral not found.');
    const access: ReferralAccess = referralAccess(auth, referral);
    return { referral, access };
  }

  private async createRequests(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    referralId: string,
    referringInstitutionId: string,
    institutionIds: string[],
    at: Date,
  ) {
    for (const institutionId of institutionIds) {
      const request = await tx.referralRequest.create({
        data: { referralId, institutionId, sentById: auth.userId, sentAt: at },
      });
      await recordReferralEvent(tx, {
        referralId,
        type: 'REQUEST_SENT',
        actorId: auth.userId,
        institutionId,
        requestId: request.id,
        metadata: { from: referringInstitutionId },
        at,
      });
    }
  }

  private async assertReceivingFacilities(
    institutionIds: string[],
    referral: { networkId: string; referringInstitutionId: string },
  ): Promise<void> {
    if (institutionIds.includes(referral.referringInstitutionId)) {
      throw new BadRequestException('A facility can’t refer a patient to itself.');
    }
    const valid = await this.prisma.institution.count({
      where: {
        id: { in: institutionIds },
        networkId: referral.networkId,
        type: 'FACILITY',
        status: 'ACTIVE',
      },
    });
    if (valid !== institutionIds.length) {
      throw new BadRequestException('Choose active healthcare facilities in this network.');
    }
  }

  private async assertServicesInNetwork(serviceIds: string[], networkId: string): Promise<void> {
    if (serviceIds.length === 0) return;
    const count = await this.prisma.service.count({ where: { id: { in: serviceIds }, networkId } });
    if (count !== new Set(serviceIds).size)
      throw new BadRequestException('Some services are not in this network’s catalogue.');
  }

  /** Receiving staff choose a department when accepting; only their own facility's list is shared. */
  private async departmentsForResponders(
    requests: { id: string; institutionId: string }[],
    access: ReferralAccess,
  ): Promise<Map<string, { id: string; name: string }[]>> {
    const ids = requests
      .filter((r) => access.respondableRequestIds.includes(r.id))
      .map((r) => r.institutionId);
    if (ids.length === 0) return new Map();
    const departments = await this.prisma.department.findMany({
      where: { institutionId: { in: ids } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, institutionId: true },
    });
    const map = new Map<string, { id: string; name: string }[]>();
    for (const d of departments)
      map.set(d.institutionId, [...(map.get(d.institutionId) ?? []), { id: d.id, name: d.name }]);
    return map;
  }

  /** Records who opened patient information, at most once per person per referral every 15 minutes. */
  private async auditView(
    auth: AuthContext,
    referral: { id: string; networkId: string; reference: string },
    meta: RequestMeta,
  ) {
    const recent = await this.prisma.auditEvent.findFirst({
      where: {
        action: 'referral.viewed',
        actorId: auth.userId,
        entityId: referral.id,
        occurredAt: { gt: new Date(Date.now() - VIEW_AUDIT_INTERVAL_MS) },
      },
      select: { id: true },
    });
    if (recent) return;
    await this.audit.record({
      action: 'referral.viewed',
      entityType: 'referral',
      entityId: referral.id,
      actorId: auth.userId,
      networkId: referral.networkId,
      metadata: { reference: referral.reference },
      meta,
    });
  }

  private auditReferral(
    tx: Prisma.TransactionClient,
    auth: AuthContext,
    referral: { id: string; networkId: string; referringInstitutionId: string; reference: string },
    action: string,
    meta: RequestMeta,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record(
      {
        action,
        entityType: 'referral',
        entityId: referral.id,
        actorId: auth.userId,
        networkId: referral.networkId,
        institutionId: referral.referringInstitutionId,
        metadata: { reference: referral.reference, ...metadata },
        meta,
      },
      tx,
    );
  }
}

function patientData(p: PatientInput) {
  return {
    fullName: p.fullName ?? null,
    sex: p.sex,
    dateOfBirth: p.dateOfBirth ? new Date(`${p.dateOfBirth}T00:00:00Z`) : null,
    estimatedAge: p.dateOfBirth ? null : (p.estimatedAge ?? null),
    estimatedAgeUnit: p.dateOfBirth ? null : (p.estimatedAgeUnit ?? null),
    nationalId: p.nationalId ?? null,
    shaNumber: p.shaNumber ?? null,
    hospitalNumber: p.hospitalNumber ?? null,
    nextOfKinName: p.nextOfKinName ?? null,
    nextOfKinPhone: p.nextOfKinPhone ?? null,
  };
}

const CLINICAL_KEYS = [
  'pregnancyStatus',
  'gestationWeeks',
  'reason',
  'clinicalSummary',
  'provisionalDiagnosis',
  'treatmentGiven',
  'allergies',
  'urgency',
] as const;

/** Only fields present in the input are written, so partial draft updates don't clear others. */
function clinicalData(
  input: UpdateReferralDraftInput,
): Partial<Pick<Referral, (typeof CLINICAL_KEYS)[number]>> {
  const data: Record<string, unknown> = {};
  for (const key of CLINICAL_KEYS) if (input[key] !== undefined) data[key] = input[key];
  return data;
}
