import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  confirmAssignmentSchema,
  declineAssignmentSchema,
  externalTransportSchema,
  handoverSchema,
  listTransfersQuerySchema,
  offerVehicleSchema,
  reasonSchema,
  reassignSchema,
  transferRequestSchema,
  transportCostSchema,
  updateTransferSchema,
} from '@lifeline/schemas';
import { z } from 'zod';
import { Auth, AuthContext } from '../auth/auth-context';
import { Meta, RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { LiveService } from '../live/live.service';
import { DispatchService } from './dispatch.service';
import { TransfersService } from './transfers.service';

@Controller()
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly dispatch: DispatchService,
    private readonly live: LiveService,
  ) {}

  /** Tells connected viewers once the change is committed. */
  private async notify<T>(result: Promise<T>, transferId: string | ((r: T) => string)): Promise<T> {
    const value = await result;
    void this.live.transferChanged(typeof transferId === 'string' ? transferId : transferId(value));
    return value;
  }

  private async notifyAssignment<T>(result: Promise<T>, assignmentId: string): Promise<T> {
    const value = await result;
    void this.live.assignmentChanged(assignmentId);
    return value;
  }

  @Post('referrals/:referralId/transfer')
  create(
    @Auth() auth: AuthContext,
    @Param('referralId') referralId: string,
    @Body(new ZodPipe(transferRequestSchema)) body: z.infer<typeof transferRequestSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notify(this.transfers.create(auth, referralId, body, meta), (r) => r.id);
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
    return this.notify(this.transfers.update(auth, transferId, body, meta), transferId);
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
    return this.notify(this.transfers.offer(auth, transferId, body, meta), transferId);
  }

  @Post('transfers/:transferId/external')
  external(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Body(new ZodPipe(externalTransportSchema)) body: z.infer<typeof externalTransportSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notify(this.transfers.recordExternal(auth, transferId, body, meta), transferId);
  }

  @Post('transfers/:transferId/cancel')
  @HttpCode(204)
  cancel(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notify(this.transfers.cancel(auth, transferId, body.reason, meta), transferId);
  }

  @Post('transfers/:transferId/handover')
  @HttpCode(204)
  signHandover(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Body(new ZodPipe(handoverSchema)) body: z.infer<typeof handoverSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notify(this.transfers.signHandover(auth, transferId, body, meta), transferId);
  }

  @Post('transfers/:transferId/cost')
  @HttpCode(204)
  recordCost(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Body(new ZodPipe(transportCostSchema)) body: z.infer<typeof transportCostSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notify(this.transfers.recordCost(auth, transferId, body, meta), transferId);
  }

  @Post('transfers/:transferId/complete')
  @HttpCode(204)
  complete(
    @Auth() auth: AuthContext,
    @Param('transferId') transferId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.notify(this.transfers.complete(auth, transferId, meta), transferId);
  }

  @Post('dispatch-assignments/:assignmentId/withdraw')
  @HttpCode(204)
  withdraw(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notifyAssignment(
      this.transfers.withdraw(auth, assignmentId, body.reason, meta),
      assignmentId,
    );
  }

  @Post('dispatch-assignments/:assignmentId/confirm')
  @HttpCode(204)
  confirm(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(confirmAssignmentSchema)) body: z.infer<typeof confirmAssignmentSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notifyAssignment(
      this.dispatch.confirm(auth, assignmentId, body, meta),
      assignmentId,
    );
  }

  @Post('dispatch-assignments/:assignmentId/decline')
  @HttpCode(204)
  decline(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(declineAssignmentSchema)) body: z.infer<typeof declineAssignmentSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notifyAssignment(
      this.dispatch.decline(auth, assignmentId, body, meta),
      assignmentId,
    );
  }

  @Post('dispatch-assignments/:assignmentId/reassign')
  @HttpCode(204)
  reassign(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(reassignSchema)) body: z.infer<typeof reassignSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notifyAssignment(
      this.dispatch.reassign(auth, assignmentId, body, meta),
      assignmentId,
    );
  }

  @Post('dispatch-assignments/:assignmentId/release')
  @HttpCode(204)
  release(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.notifyAssignment(
      this.dispatch.release(auth, assignmentId, body.reason, meta),
      assignmentId,
    );
  }

  @Post('dispatch-assignments/:assignmentId/dispatch')
  @HttpCode(204)
  markDispatched(
    @Auth() auth: AuthContext,
    @Param('assignmentId') assignmentId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.notifyAssignment(this.dispatch.dispatch(auth, assignmentId, meta), assignmentId);
  }
}
