import { Module } from '@nestjs/common';
import { AutoCloseJob } from './auto-close.job';
import { AutomationService } from './automation.service';
import { SlaService } from './sla.service';
import {
  ApprovalsController,
  AutomationRulesController,
  BusinessCalendarsController,
  EscalationPoliciesController,
  SlaPoliciesController,
  TicketsController,
} from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  controllers: [
    TicketsController,
    ApprovalsController,
    SlaPoliciesController,
    AutomationRulesController,
    BusinessCalendarsController,
    EscalationPoliciesController,
  ],
  providers: [TicketsService, SlaService, AutomationService, AutoCloseJob],
  exports: [TicketsService],
})
export class TicketsModule {}
