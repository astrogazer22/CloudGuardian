import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CrmModule } from './crm/crm.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { SlackModule } from './integrations/slack.controller';
import { InventoryModule } from './inventory/inventory.module';
import { KbModule } from './kb/kb.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { TeamsModule } from './teams/teams.module';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '12h') as any },
    }),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    IntegrationsModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    WorkflowsModule,
    TicketsModule,
    CrmModule,
    InventoryModule,
    SearchModule,
    DashboardModule,
    ReportsModule,
    KbModule,
    CatalogModule,
    SlackModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
