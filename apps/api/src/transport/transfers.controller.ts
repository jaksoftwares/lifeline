import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  confirmAssignmentSchema,
  declineAssignmentSchema,
  externalTransportSchema,
  listTransfersQuerySchema,
  offerVehicleSchema,
  reasonSchema,
  reassignSchema,
  transferRequestSchema,
  updateTransferSchema,
} from '@lifeline/schemas';
import { z } from 'zod';
import { Auth, AuthContext } from '../auth/auth-context';
import { Meta, RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { DispatchService } from './dispatch.service';
import { TransfersService } from './transfers.service';

@Controller()
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly dispatch: DispatchService,
  ) {}

  @Post('referrals/:referralId/transfer')
  create(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @Body(new ZodPipe(transferRequestSchema)) body: z.infer<typeof transferRequestSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.transfers.create(auth, referralId, body, meta);
  }

  @Get('transfers')
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(listTransfersQuerySchema)) query: z.infer<typeof listTransfersQuerySchema>,
  ) {
    return this.transfers.list(auth, query);
  }

  @Get('transfers/:transferId')
  detail(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.transfers.detail(auth, transferId, meta);
  }

  @Patch('transfers/:transferId')
  @HttpCode(204)
  update(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Body(new ZodPipe(updateTransferSchema)) body: z.infer<typeof updateTransferSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.transfers.update(auth, transferId, body, meta);
  }

  @Get('transfers/:transferId/suggestions')
  suggestions(@Auth() auth: AuthContext, @Param('transferId') transferId: string) {
    return this.transfers.suggestions(auth, transferId);
  }

  @Post('transfers/:transferId/offers')
  offer(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Body(new ZodPipe(offerVehicleSchema)) body: z.infer<typeof offerVehicleSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.transfers.offer(auth, transferId, body, meta);
  }

  @Post('transfers/:transferId/external')
  external(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Body(new ZodPipe(externalTransportSchema)) body: z.infer<typeof externalTransportSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.transfers.recordExternal(auth, transferId, body, meta);
  }

  @Post('transfers/:transferId/cancel')
  @HttpCode(204)
  cancel(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.transfers.cancel(auth, transferId, body.reason, meta);
  }

  @Post('dispatch-assignments/:assignmentId/withdraw')
  @HttpCode(204)
  withdraw(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.transfers.withdraw(auth, assignmentId, body.reason, meta);
  }

  @Post('dispatch-assignments/:assignmentId/confirm')
  @HttpCode(204)
  confirm(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(confirmAssignmentSchema)) body: z.infer<typeof confirmAssignmentSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.dispatch.confirm(auth, assignmentId, body, meta);
  }

  @Post('dispatch-assignments/:assignmentId/decline')
  @HttpCode(204)
  decline(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(declineAssignmentSchema)) body: z.infer<typeof declineAssignmentSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.dispatch.decline(auth, assignmentId, body, meta);
  }

  @Post('dispatch-assignments/:assignmentId/reassign')
  @HttpCode(204)
  reassign(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(reassignSchema)) body: z.infer<typeof reassignSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.dispatch.reassign(auth, assignmentId, body, meta);
  }

  @Post('dispatch-assignments/:assignmentId/release')
  @HttpCode(204)
  release(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.dispatch.release(auth, assignmentId, body.reason, meta);
  }

  @Post('dispatch-assignments/:assignmentId/dispatch')
  @HttpCode(204)
  markDispatched(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.dispatch.dispatch(auth, assignmentId, meta);
  }
}
