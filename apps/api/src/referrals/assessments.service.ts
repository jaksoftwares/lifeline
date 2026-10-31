import { ConflictException, Injectable } from '@nestjs/common';
import {
  calculateScore,
  SCORE_BAND_LABELS,
  scoreNotApplicableReason,
  VITAL_LABELS,
} from '@lifeline/domain';
import { type AssessmentView, type VitalsInput } from '@lifeline/schemas';
import { AuditService } from '../audit/audit.service';
import { type AuthContext } from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { patientAge, toAssessmentView } from './mappers';
import { assertReferrer } from './referral-access';
import { recordReferralEvent } from './referral-records';
import { ReferralsService } from './referrals.service';

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly referrals: ReferralsService,
  ) {}

  /**
   * Records observations from the referring facility. The score is worked out now, with the network's
   * chosen definition, and stored with the observations so later readers see what was shown at the time.
   */
  async record(
    auth: AuthContext,
    referralId: string,
    input: VitalsInput,
    meta: RequestMeta,
  ): Promise<AssessmentView> {
    const { referral, access } = await this.referrals.load(auth, referralId);
    assertReferrer(access);
    if (referral.status === 'CANCELLED') throw new ConflictException('This referral is cancelled.');

    const [network, patient] = await Promise.all([
      this.prisma.network.findUniqueOrThrow({ where: { id: referral.networkId } }),
      this.prisma.patient.findUniqueOrThrow({ where: { id: referral.patientId } }),
    ]);

    let scoreTotal: number | null = null;
    let scoreBand: string | null = null;
    let scoreNote: string | null = null;
    const scoreType = network.earlyWarningScore === 'NONE' ? null : network.earlyWarningScore;
    if (scoreType) {
      const notApplicable = scoreNotApplicableReason({
        ageYears: patientAge(patient),
        pregnancyStatus: referral.pregnancyStatus,
      });
      if (notApplicable) {
        scoreNote = notApplicable;
      } else {
        const result = calculateScore(scoreType, input);
        scoreTotal = result.total;
        scoreBand = result.band;
        if (result.missing.length) {
          scoreNote = `Not calculated: ${result.missing.map((m) => VITAL_LABELS[m].toLowerCase()).join(', ')} missing.`;
        }
      }
    }

    const { observedAt, ...vitals } = input;
    const assessment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalAssessment.create({
        data: {
          referralId,
          recordedById: auth.userId,
          observedAt: observedAt ? new Date(observedAt) : new Date(),
          ...vitals,
          notes: vitals.notes ?? null,
          scoreType,
          scoreTotal,
          scoreBand,
          scoreNote,
        },
        include: { recordedBy: { select: { id: true, fullName: true } } },
      });
      await recordReferralEvent(tx, {
        referralId,
        type: 'ASSESSMENT_RECORDED',
        actorId: auth.userId,
        institutionId: referral.referringInstitutionId,
        note:
          scoreType && scoreTotal !== null && scoreBand
            ? `${scoreType} ${scoreTotal} (${SCORE_BAND_LABELS[scoreBand as keyof typeof SCORE_BAND_LABELS].toLowerCase()})`
            : null,
      });
      await this.audit.record(
        {
          action: 'referral.assessment_recorded',
          entityType: 'referral',
          entityId: referralId,
          actorId: auth.userId,
          networkId: referral.networkId,
          institutionId: referral.referringInstitutionId,
          metadata: { reference: referral.reference },
          meta,
        },
        tx,
      );
      return created;
    });
    return toAssessmentView(assessment);
  }
}
