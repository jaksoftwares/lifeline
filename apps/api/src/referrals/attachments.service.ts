import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AttachmentView } from '@lifeline/schemas';
import { AuditService } from '../audit/audit.service';
import { type AuthContext, NOT_PERMITTED } from '../auth/auth-context';
import { type RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { attachmentSelect, toAttachmentView } from './mappers';
import { assertCanView } from './referral-access';
import { recordReferralEvent } from './referral-records';
import { ReferralsService } from './referrals.service';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_REFERRAL = 10;

/** Recognised by content, not by the name or type the browser claims. */
const SIGNATURES: { type: string; magic: number[] }[] = [
  { type: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
];

export function detectContentType(data: Buffer): string | null {
  return SIGNATURES.find((s) => s.magic.every((byte, i) => data[i] === byte))?.type ?? null;
}

/** Keeps a readable file name without paths or control characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'attachment';
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (cleaned || 'attachment').slice(0, 120);
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly referrals: ReferralsService,
  ) {}

  async upload(
    auth: AuthContext,
    referralId: string,
    file: { originalname: string; buffer: Buffer; size: number } | undefined,
    meta: RequestMeta,
  ): Promise<AttachmentView> {
    if (!file) throw new BadRequestException('Choose a file to attach.');
    const { referral, access } = await this.referrals.load(auth, referralId);
    assertCanView(access);

    // Staff on either side may attach documents; the uploading facility is recorded.
    let institutionId: string | null = null;
    if (access.isReferrer) institutionId = referral.referringInstitutionId;
    else {
      const ownRequest = referral.requests.find((r) => access.receivingRequestIds.includes(r.id));
      institutionId = ownRequest?.institutionId ?? null;
    }
    if (!institutionId) throw new ForbiddenException(NOT_PERMITTED);
    if (referral.status === 'CANCELLED') throw new ConflictException('This referral is cancelled.');

    if (file.size > MAX_ATTACHMENT_BYTES)
      throw new BadRequestException('Files must be 10 MB or smaller.');
    const contentType = detectContentType(file.buffer);
    if (!contentType) throw new BadRequestException('Attach a PDF, JPEG or PNG file.');
    const count = await this.prisma.attachment.count({ where: { referralId } });
    if (count >= MAX_ATTACHMENTS_PER_REFERRAL) {
      throw new BadRequestException(
        `A referral can have up to ${MAX_ATTACHMENTS_PER_REFERRAL} attachments.`,
      );
    }

    const fileName = safeFileName(file.originalname);
    const uploadingInstitutionId = institutionId;
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.attachment.create({
        data: {
          referralId,
          fileName,
          contentType,
          sizeBytes: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          data: new Uint8Array(file.buffer),
          uploadedById: auth.userId,
          uploadedByInstitutionId: uploadingInstitutionId,
        },
        select: attachmentSelect,
      });
      await recordReferralEvent(tx, {
        referralId,
        type: 'ATTACHMENT_ADDED',
        actorId: auth.userId,
        institutionId: uploadingInstitutionId,
        note: fileName,
      });
      await this.audit.record(
        {
          action: 'referral.attachment_added',
          entityType: 'attachment',
          entityId: row.id,
          actorId: auth.userId,
          networkId: referral.networkId,
          institutionId: uploadingInstitutionId,
          metadata: { reference: referral.reference },
          meta,
        },
        tx,
      );
      return row;
    });
    return toAttachmentView(created);
  }

  async download(auth: AuthContext, attachmentId: string, meta: RequestMeta) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    const { referral, access } = await this.referrals.load(auth, attachment.referralId);
    assertCanView(access);
    await this.audit.record({
      action: 'referral.attachment_downloaded',
      entityType: 'attachment',
      entityId: attachment.id,
      actorId: auth.userId,
      networkId: referral.networkId,
      metadata: { reference: referral.reference },
      meta,
    });
    return attachment;
  }
}
