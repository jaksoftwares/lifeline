import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  addRequestsSchema,
  createReferralSchema,
  listReferralsQuerySchema,
  messageInputSchema,
  reasonSchema,
  respondToRequestSchema,
  submitReferralSchema,
  updateReferralDraftSchema,
  vitalsInputSchema,
} from '@lifeline/schemas';
import { Response } from 'express';
import { z } from 'zod';
import { Auth, AuthContext } from '../auth/auth-context';
import { Meta, RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { AssessmentsService } from './assessments.service';
import { AttachmentsService, MAX_ATTACHMENT_BYTES } from './attachments.service';
import { ReferralsService } from './referrals.service';
import { ResponsesService } from './responses.service';

interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Controller()
export class ReferralsController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly responses: ResponsesService,
    private readonly assessments: AssessmentsService,
    private readonly attachments: AttachmentsService,
  ) {}

  @Get('referrals')
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(listReferralsQuerySchema)) query: z.infer<typeof listReferralsQuerySchema>,
  ) {
    return this.referrals.list(auth, query);
  }

  @Post('referrals')
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createReferralSchema)) body: z.infer<typeof createReferralSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.referrals.create(auth, body, meta);
  }

  @Get('referrals/:referralId')
  detail(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.referrals.detail(auth, referralId, meta);
  }

  @Patch('referrals/:referralId')
  @HttpCode(204)
  updateDraft(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @Body(new ZodPipe(updateReferralDraftSchema)) body: z.infer<typeof updateReferralDraftSchema>,
  ) {
    return this.referrals.updateDraft(auth, referralId, body);
  }

  @Post('referrals/:referralId/submit')
  @HttpCode(204)
  submit(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @Body(new ZodPipe(submitReferralSchema)) body: z.infer<typeof submitReferralSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.referrals.submit(auth, referralId, body.institutionIds, meta);
  }

  @Post('referrals/:referralId/requests')
  @HttpCode(204)
  addRequests(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @Body(new ZodPipe(addRequestsSchema)) body: z.infer<typeof addRequestsSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.referrals.addRequests(auth, referralId, body.institutionIds, meta);
  }

  @Post('referrals/:referralId/cancel')
  @HttpCode(204)
  cancel(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.referrals.cancel(auth, referralId, body.reason, meta);
  }

  @Post('referrals/:referralId/assessments')
  recordAssessment(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @Body(new ZodPipe(vitalsInputSchema)) body: z.infer<typeof vitalsInputSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.assessments.record(auth, referralId, body, meta);
  }

  @Post('referrals/:referralId/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }),
  )
  upload(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Meta() meta: RequestMeta,
  ) {
    return this.attachments.upload(auth, referralId, file, meta);
  }

  @Get('attachments/:attachmentId')
  async download(
    @Auth() auth: AuthContext,
    @Param('attachmentId') attachmentId: string,
    @Meta() meta: RequestMeta,
    @Res() res: Response,
  ) {
    const file = await this.attachments.download(auth, attachmentId, meta);
    const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, '_');
    res.set({
      'Content-Type': file.contentType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      // Patient documents must not linger in shared or proxy caches.
      'Cache-Control': 'no-store',
    });
    res.end(Buffer.from(file.data));
  }

  @Post('referral-requests/:requestId/respond')
  @HttpCode(204)
  respond(
    @Auth() auth: AuthContext,
    @Param('requestId') requestId: string,
    @Body(new ZodPipe(respondToRequestSchema)) body: z.infer<typeof respondToRequestSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.responses.respond(auth, requestId, body, meta);
  }

  @Post('referral-requests/:requestId/messages')
  @HttpCode(204)
  message(
    @Auth() auth: AuthContext,
    @Param('requestId') requestId: string,
    @Body(new ZodPipe(messageInputSchema)) body: z.infer<typeof messageInputSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.responses.postMessage(auth, requestId, body.body, meta);
  }

  @Post('referral-requests/:requestId/withdraw')
  @HttpCode(204)
  withdraw(
    @Auth() auth: AuthContext,
    @Param('requestId') requestId: string,
    @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.referrals.withdrawRequest(auth, requestId, body.reason, meta);
  }
}
