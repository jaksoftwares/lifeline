import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { TokenService } from './auth/token.service';
import { AppConfig } from './config/app-config';
import { CapacityService } from './facilities/capacity.service';
import { FacilitiesController } from './facilities/facilities.controller';
import { FacilitiesService } from './facilities/facilities.service';
import { CrewController } from './crew/crew.controller';
import { CrewService } from './crew/crew.service';
import { HealthController } from './health/health.controller';
import { LiveController } from './live/live.controller';
import { LiveService } from './live/live.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { PostmarkEmailService } from './notifications/postmark-email.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { RoutingService } from './live/routing.service';
import { TrackingService } from './live/tracking.service';
import { InstitutionsController } from './institutions/institutions.controller';
import { PrismaService } from './prisma/prisma.service';
import { AssessmentsService } from './referrals/assessments.service';
import { AttachmentsService } from './referrals/attachments.service';
import { ReferralsController } from './referrals/referrals.controller';
import { ReferralsService } from './referrals/referrals.service';
import { ResponsesService } from './referrals/responses.service';
import { DispatchService } from './transport/dispatch.service';
import { FleetController } from './transport/fleet.controller';
import { FleetService } from './transport/fleet.service';
import { TransfersController } from './transport/transfers.controller';
import { TransfersService } from './transport/transfers.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

// Modules are split out as each phase adds a bounded context (referrals, dispatch, …).
@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
  ],
  controllers: [
    AuthController,
    UsersController,
    InstitutionsController,
    FacilitiesController,
    ReferralsController,
    FleetController,
    TransfersController,
    CrewController,
    LiveController,
    AuditController,
    NotificationsController,
    ReportsController,
    HealthController,
  ],
  providers: [
    AppConfig,
    PrismaService,
    AuditService,
    TokenService,
    AuthService,
    UsersService,
    FacilitiesService,
    CapacityService,
    ReferralsService,
    ResponsesService,
    AssessmentsService,
    AttachmentsService,
    FleetService,
    TransfersService,
    DispatchService,
    CrewService,
    LiveService,
    RoutingService,
    TrackingService,
    NotificationsService,
    PostmarkEmailService,
    ReportsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
