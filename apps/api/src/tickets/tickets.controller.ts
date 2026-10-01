import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import {
  AutomationRuleDto,
  CalendarDto,
  EscalationPolicyDto,
  CommentDto,
  CreateTicketDto,
  DecideApprovalDto,
  LinkAssetDto,
  ListTicketsQuery,
  SlaPolicyDto,
  TransitionDto,
  UpdateTicketDto,
} from './dto';
import { addBusinessTime, validateTimezone, validateWeeklyHours } from './business-time';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private tickets: TicketsService) {}

  @RequirePermissions('tickets:read')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListTicketsQuery) {
    return this.tickets.list(user, q);
  }

  @RequirePermissions('tickets:read')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tickets.get(id, user);
  }

  @RequirePermissions('tickets:create')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user, dto);
  }

  @RequirePermissions('tickets:read')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.tickets.update(id, user, dto);
  }

  @RequirePermissions('tickets:transition')
  @Post(':id/transitions')
  transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransitionDto) {
    return this.tickets.transition(id, user, dto);
  }

  @RequirePermissions('tickets:comment')
  @Post(':id/comments')
  comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.tickets.addComment(id, user, dto);
  }

  @RequirePermissions('tickets:edit')
  @Post(':id/assets')
  linkAsset(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkAssetDto) {
    return this.tickets.linkAsset(id, user, dto.assetId);
  }

  @RequirePermissions('tickets:edit')
  @Delete(':id/assets/:assetId')
  unlinkAsset(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('assetId') assetId: string) {
    return this.tickets.unlinkAsset(id, user, assetId);
  }
}

@Controller('approvals')
export class ApprovalsController {
  constructor(private tickets: TicketsService) {}

  @RequirePermissions('approvals:decide')
  @Get()
  pending(@CurrentUser() user: AuthUser) {
    return this.tickets.pendingApprovals(user);
  }

  @RequirePermissions('approvals:decide')
  @Post(':id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideApprovalDto) {
    return this.tickets.decideApproval(id, user, dto.approve, dto.comment);
  }
}

@Controller('sla-policies')
export class SlaPoliciesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('tickets:read')
  @Get()
  list() {
    return this.prisma.slaPolicy.findMany({ orderBy: { priority: 'asc' } });
  }

  @RequirePermissions('settings:manage')
  @Put()
  async upsert(@CurrentUser() actor: AuthUser, @Body() dto: SlaPolicyDto) {
    const { priority, ...values } = dto;
    const policy = await this.prisma.slaPolicy.upsert({ where: { priority }, create: dto, update: values });
    await this.audit.log(actor.id, 'sla.updated', 'SlaPolicy', policy.id, dto as any);
    return policy;
  }
}

@Controller('automation-rules')
export class AutomationRulesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('settings:manage')
  @Get()
  list() {
    return this.prisma.automationRule.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @RequirePermissions('settings:manage')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: AutomationRuleDto) {
    const rule = await this.prisma.automationRule.create({ data: this.toData(dto) as Prisma.AutomationRuleCreateInput });
    await this.audit.log(actor.id, 'automation.created', 'AutomationRule', rule.id, { name: rule.name });
    return rule;
  }

  @RequirePermissions('settings:manage')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: Partial<AutomationRuleDto>) {
    const rule = await this.prisma.automationRule.update({ where: { id }, data: this.toData(dto) });
    await this.audit.log(actor.id, 'automation.updated', 'AutomationRule', id, dto as any);
    return rule;
  }

  @RequirePermissions('settings:manage')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.automationRule.delete({ where: { id } });
    await this.audit.log(actor.id, 'automation.deleted', 'AutomationRule', id);
    return { ok: true };
  }

  private toData(dto: Partial<AutomationRuleDto>): Prisma.AutomationRuleUpdateInput {
    return {
      name: dto.name,
      enabled: dto.enabled,
      sortOrder: dto.sortOrder,
      conditions: dto.conditions as Prisma.InputJsonValue | undefined,
      actions: dto.actions as Prisma.InputJsonValue | undefined,
    };
  }
}

@Controller('business-calendars')
export class BusinessCalendarsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('tickets:read')
  @Get()
  list() {
    return this.prisma.businessCalendar.findMany({
      include: { teams: { select: { id: true, name: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  /** How a duration lands on this calendar starting now — used by the admin UI for a quick sanity check. */
  @RequirePermissions('settings:manage')
  @Get(':id/preview')
  async preview(@Param('id') id: string, @Query('minutes') minutes = '240') {
    const cal = await this.prisma.businessCalendar.findUniqueOrThrow({ where: { id } });
    const from = new Date();
    return { from, minutes: Number(minutes), due: addBusinessTime(from, Number(minutes) * 60_000, cal) };
  }

  @RequirePermissions('settings:manage')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CalendarDto) {
    this.validate(dto);
    const cal = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.businessCalendar.updateMany({ data: { isDefault: false } });
      return tx.businessCalendar.create({ data: { ...dto, holidays: dto.holidays ?? [] } });
    });
    await this.audit.log(actor.id, 'calendar.created', 'BusinessCalendar', cal.id, { name: cal.name });
    return cal;
  }

  @RequirePermissions('settings:manage')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: Partial<CalendarDto>) {
    this.validate(dto);
    const cal = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.businessCalendar.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      return tx.businessCalendar.update({ where: { id }, data: dto });
    });
    await this.audit.log(actor.id, 'calendar.updated', 'BusinessCalendar', id, { name: cal.name });
    return cal;
  }

  @RequirePermissions('settings:manage')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.businessCalendar.delete({ where: { id } });
    await this.audit.log(actor.id, 'calendar.deleted', 'BusinessCalendar', id);
    return { ok: true };
  }

  private validate(dto: Partial<CalendarDto>) {
    if (dto.timezone && !validateTimezone(dto.timezone)) throw new BadRequestException(`Unknown timezone ${dto.timezone}`);
    if (dto.hours) {
      const err = validateWeeklyHours(dto.hours);
      if (err) throw new BadRequestException(err);
    }
    const bad = (dto.holidays ?? []).filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
    if (bad.length) throw new BadRequestException(`Holidays must be YYYY-MM-DD: ${bad.join(', ')}`);
  }
}

@Controller('escalation-policies')
export class EscalationPoliciesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('settings:manage')
  @Get()
  list() {
    return this.prisma.escalationPolicy.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  @RequirePermissions('settings:manage')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: EscalationPolicyDto) {
    this.validate(dto.levels);
    const p = await this.prisma.escalationPolicy.create({
      data: { ...dto, priorities: dto.priorities ?? [], levels: dto.levels as Prisma.InputJsonValue },
    });
    await this.audit.log(actor.id, 'escalation.created', 'EscalationPolicy', p.id, { name: p.name });
    return p;
  }

  @RequirePermissions('settings:manage')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: Partial<EscalationPolicyDto>) {
    if (dto.levels) this.validate(dto.levels);
    const p = await this.prisma.escalationPolicy.update({
      where: { id },
      data: { ...dto, levels: dto.levels as Prisma.InputJsonValue | undefined },
    });
    await this.audit.log(actor.id, 'escalation.updated', 'EscalationPolicy', id, { name: p.name });
    return p;
  }

  @RequirePermissions('settings:manage')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.escalationPolicy.delete({ where: { id } });
    await this.audit.log(actor.id, 'escalation.deleted', 'EscalationPolicy', id);
    return { ok: true };
  }

  private validate(levels: EscalationPolicyDto['levels']) {
    const targets = ['assignee', 'team', 'team_lead', 'admins'];
    let prev = -1;
    for (const [i, l] of levels.entries()) {
      if (typeof l.afterMins !== 'number' || l.afterMins < 0) throw new BadRequestException(`Level ${i + 1}: afterMins must be ≥ 0`);
      if (l.afterMins < prev) throw new BadRequestException('Levels must be in ascending afterMins order');
      prev = l.afterMins;
      const bad = (l.notify ?? []).filter((n) => !targets.includes(n));
      if (bad.length) throw new BadRequestException(`Level ${i + 1}: unknown notify targets ${bad.join(', ')}`);
    }
  }
}
