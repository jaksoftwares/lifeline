import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  crewMemberInputSchema,
  updateCrewMemberSchema,
  updateVehicleSchema,
  vehicleInputSchema,
  vehicleStatusSchema,
} from '@lifeline/schemas';
import { z } from 'zod';
import { Auth, AuthContext } from '../auth/auth-context';
import { Meta, RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { FleetService } from './fleet.service';

const vehiclesQuerySchema = z.object({ providerId: z.string().min(1).optional() });

@Controller()
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('networks/:networkId/vehicles')
  listVehicles(
    @Auth() auth: AuthContext,
    @Param('networkId') networkId: string,
    @Query(new ZodPipe(vehiclesQuerySchema)) query: z.infer<typeof vehiclesQuerySchema>,
  ) {
    return this.fleet.listVehicles(auth, networkId, query.providerId);
  }

  @Post('institutions/:institutionId/vehicles')
  createVehicle(
    @Auth() auth: AuthContext,
    @Param('institutionId') institutionId: string,
    @Body(new ZodPipe(vehicleInputSchema)) body: z.infer<typeof vehicleInputSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.fleet.createVehicle(auth, institutionId, body, meta);
  }

  @Patch('vehicles/:vehicleId')
  @HttpCode(204)
  updateVehicle(
    @Auth() auth: AuthContext,
    @Param('vehicleId') vehicleId: string,
    @Body(new ZodPipe(updateVehicleSchema)) body: z.infer<typeof updateVehicleSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.fleet.updateVehicle(auth, vehicleId, body, meta);
  }

  @Post('vehicles/:vehicleId/status')
  @HttpCode(204)
  setVehicleStatus(
    @Auth() auth: AuthContext,
    @Param('vehicleId') vehicleId: string,
    @Body(new ZodPipe(vehicleStatusSchema)) body: z.infer<typeof vehicleStatusSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.fleet.setVehicleStatus(auth, vehicleId, body, meta);
  }

  @Get('institutions/:institutionId/crew')
  listCrew(@Auth() auth: AuthContext, @Param('institutionId') institutionId: string) {
    return this.fleet.listCrew(auth, institutionId);
  }

  @Post('institutions/:institutionId/crew')
  createCrewMember(
    @Auth() auth: AuthContext,
    @Param('institutionId') institutionId: string,
    @Body(new ZodPipe(crewMemberInputSchema)) body: z.infer<typeof crewMemberInputSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.fleet.createCrewMember(auth, institutionId, body, meta);
  }

  @Patch('crew/:crewMemberId')
  @HttpCode(204)
  updateCrewMember(
    @Auth() auth: AuthContext,
    @Param('crewMemberId') crewMemberId: string,
    @Body(new ZodPipe(updateCrewMemberSchema)) body: z.infer<typeof updateCrewMemberSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.fleet.updateCrewMember(auth, crewMemberId, body, meta);
  }
}
