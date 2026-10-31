import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  capacityUpdateSchema,
  createInstitutionSchema,
  departmentInputSchema,
  facilitySearchQuerySchema,
  setResourcesSchema,
  setServicesSchema,
  updateFacilityProfileSchema,
  updateInstitutionIdentitySchema,
} from '@lifeline/schemas';
import { z } from 'zod';
import { Auth, AuthContext } from '../auth/auth-context';
import { Meta, RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import { CapacityService } from './capacity.service';
import { FacilitiesService } from './facilities.service';

@Controller()
export class FacilitiesController {
  constructor(
    private readonly facilities: FacilitiesService,
    private readonly capacity: CapacityService,
  ) {}

  @Get('networks/:networkId/catalogue')
  catalogue(@Auth() auth: AuthContext, @Param('networkId') networkId: string) {
    return this.facilities.catalogue(auth, networkId);
  }

  @Get('networks/:networkId/facilities')
  search(
    @Auth() auth: AuthContext,
    @Param('networkId') networkId: string,
    @Query(new ZodPipe(facilitySearchQuerySchema)) query: z.infer<typeof facilitySearchQuerySchema>,
  ) {
    return this.facilities.search(auth, networkId, query);
  }

  @Post('networks/:networkId/institutions')
  create(
    @Auth() auth: AuthContext,
    @Param('networkId') networkId: string,
    @Body(new ZodPipe(createInstitutionSchema)) body: z.infer<typeof createInstitutionSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.facilities.create(auth, networkId, body, meta);
  }

  @Get('institutions/:institutionId')
  detail(@Auth() auth: AuthContext, @Param('institutionId') institutionId: string) {
    return this.facilities.detail(auth, institutionId);
  }

  @Patch('institutions/:institutionId/profile')
  updateProfile(
    @Auth() auth: AuthContext,
    @Param('institutionId') institutionId: string,
    @Body(new ZodPipe(updateFacilityProfileSchema))
    body: z.infer<typeof updateFacilityProfileSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.facilities.updateProfile(auth, institutionId, body, meta);
  }

  @Patch('institutions/:institutionId/identity')
  updateIdentity(
    @Auth() auth: AuthContext,
    @Param('institutionId') institutionId: string,
    @Body(new ZodPipe(updateInstitutionIdentitySchema))
    body: z.infer<typeof updateInstitutionIdentitySchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.facilities.updateIdentity(auth, institutionId, body, meta);
  }

  @Put('institutions/:institutionId/services')
  @HttpCode(204)
  setServices(
    @Auth() auth: AuthContext,
    @Param('institutionId') institutionId: string,
    @Body(new ZodPipe(setServicesSchema)) body: z.infer<typeof setServicesSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.facilities.setServices(auth, institutionId, body.serviceIds, meta);
  }

  @Put('institutions/:institutionId/resources')
  @HttpCode(204)
  setResources(
    @Auth() auth: AuthContext,
    @Param('institutionId') institutionId: string,
    @Body(new ZodPipe(setResourcesSchema)) body: z.infer<typeof setResourcesSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.facilities.setResources(auth, institutionId, body.resourceIds, meta);
  }

  @Post('institutions/:institutionId/capacity')
  @HttpCode(200)
  reportCapacity(
    @Auth() auth: AuthContext,
    @Param('institutionId') institutionId: string,
    @Body(new ZodPipe(capacityUpdateSchema)) body: z.infer<typeof capacityUpdateSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.capacity.report(auth, institutionId, body, meta);
  }

  @Post('institutions/:institutionId/departments')
  addDepartment(
    @Auth() auth: AuthContext,
    @Param('institutionId') institutionId: string,
    @Body(new ZodPipe(departmentInputSchema)) body: z.infer<typeof departmentInputSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.facilities.addDepartment(auth, institutionId, body, meta);
  }

  @Patch('departments/:departmentId')
  updateDepartment(
    @Auth() auth: AuthContext,
    @Param('departmentId') departmentId: string,
    @Body(new ZodPipe(departmentInputSchema)) body: z.infer<typeof departmentInputSchema>,
    @Meta() meta: RequestMeta,
  ) {
    return this.facilities.updateDepartment(auth, departmentId, body, meta);
  }

  @Delete('departments/:departmentId')
  @HttpCode(204)
  removeDepartment(
    @Auth() auth: AuthContext,
    @Param('departmentId') departmentId: string,
    @Meta() meta: RequestMeta,
  ) {
    return this.facilities.removeDepartment(auth, departmentId, meta);
  }
}
