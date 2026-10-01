import { Body, Controller, Get, Global, Module, Param, Post } from '@nestjs/common';
import { TicketType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { WorkflowDefinition } from './workflow.types';
import { WorkflowsService } from './workflows.service';

class PublishWorkflowDto {
  @IsString() @MinLength(1) name: string;
  @IsEnum(TicketType) ticketType: TicketType;
  @IsOptional() @IsString() description?: string;
  @IsObject() definition: WorkflowDefinition;
}

@Controller('workflows')
class WorkflowsController {
  constructor(
    private workflows: WorkflowsService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('tickets:read')
  @Get()
  list() {
    return this.workflows.listLatest();
  }

  @RequirePermissions('tickets:read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.workflows.get(id);
  }

  @RequirePermissions('settings:manage')
  @Get(':id/versions')
  async versions(@Param('id') id: string) {
    const wf = await this.workflows.get(id);
    return this.workflows.versions(wf.name);
  }

  @RequirePermissions('settings:manage')
  @Post()
  async publish(@CurrentUser() actor: AuthUser, @Body() dto: PublishWorkflowDto) {
    const wf = await this.workflows.publish(dto.name, dto.ticketType, dto.definition, dto.description);
    await this.audit.log(actor.id, 'workflow.published', 'Workflow', wf.id, { name: wf.name, version: wf.version });
    return wf;
  }
}

@Global()
@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
