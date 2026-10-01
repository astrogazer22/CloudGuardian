import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Ticket, Workflow } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../auth/access.service';
import { AuthUser, can, matchesRole } from '../auth/permissions';
import { IntegrationsService } from '../integrations/integrations.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowDefinition, WorkflowTransition } from '../workflows/workflow.types';
import { WorkflowsService } from '../workflows/workflows.service';
import { AutomationService } from './automation.service';
import { CommentDto, CreateTicketDto, ListTicketsQuery, TransitionDto, UpdateTicketDto } from './dto';
import { SlaService } from './sla.service';

const userBrief = { select: { id: true, name: true, email: true } } as const;

const listInclude = {
  requester: userBrief,
  assignee: userBrief,
  team: { select: { id: true, name: true } },
  organization: { select: { id: true, name: true, tier: true } },
  workflow: { select: { definition: true } },
} satisfies Prisma.TicketInclude;

const TRACKED_FIELDS = [
  'title',
  'description',
  'priority',
  'category',
  'tags',
  'assigneeId',
  'teamId',
  'organizationId',
  'contactId',
  'parentId',
  'customFields',
] as const;

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private workflows: WorkflowsService,
    private sla: SlaService,
    private automation: AutomationService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private access: AccessService,
    private integrations: IntegrationsService,
  ) {}

  private scope(user: AuthUser): Prisma.TicketWhereInput {
    return this.access.ticketWhere(user);
  }

  private withStatusName<T extends { status: string; workflow: { definition: Prisma.JsonValue } }>(t: T) {
    const def = t.workflow.definition as unknown as WorkflowDefinition;
    const { workflow, ...rest } = t;
    return { ...rest, statusName: def.statuses.find((s) => s.key === t.status)?.name ?? t.status };
  }

  async list(user: AuthUser, q: ListTicketsQuery) {
    const and: Prisma.TicketWhereInput[] = [this.scope(user)];
    const open = { statusCategory: { not: 'DONE' } };
    switch (q.view) {
      case 'open':
        and.push(open);
        break;
      case 'mine':
        and.push(open, { assigneeId: user.id });
        break;
      case 'unassigned':
        and.push(open, { assigneeId: null });
        break;
      case 'breached':
        and.push(open, { slaBreached: true });
        break;
      case 'done':
        and.push({ statusCategory: 'DONE' });
        break;
    }
    if (q.status) and.push({ status: q.status });
    if (q.priority) and.push({ priority: q.priority });
    if (q.type) and.push({ type: q.type });
    if (q.teamId) and.push({ teamId: q.teamId });
    if (q.assigneeId) and.push({ assigneeId: q.assigneeId === 'me' ? user.id : q.assigneeId });
    if (q.organizationId) and.push({ organizationId: q.organizationId });
    if (q.requesterId) and.push({ requesterId: q.requesterId === 'me' ? user.id : q.requesterId });
    if (q.q) {
      const num = Number(q.q.replace(/^#/, ''));
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
          ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
        ],
      });
    }
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const where = { AND: and };
    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: listInclude,
        orderBy: { [q.sort ?? 'createdAt']: q.order ?? (q.sort === 'priority' ? 'asc' : 'desc') },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { items: items.map((t) => this.withStatusName(t)), total, page, pageSize };
  }

  async get(id: string, user: AuthUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, this.scope(user)] },
      include: {
        requester: userBrief,
        assignee: userBrief,
        team: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true, tier: true } },
        contact: { select: { id: true, name: true, email: true } },
        parent: { select: { id: true, number: true, title: true, status: true } },
        children: { select: { id: true, number: true, title: true, status: true, statusCategory: true } },
        comments: {
          where: can(user, 'tickets:view_internal') ? undefined : { internal: false },
          include: { author: userBrief },
          orderBy: { createdAt: 'asc' },
        },
        events: { include: { actor: userBrief }, orderBy: { createdAt: 'asc' } },
        approvals: { include: { requestedBy: userBrief, decidedBy: userBrief }, orderBy: { createdAt: 'desc' } },
        assets: {
          include: {
            asset: { select: { id: true, name: true, type: true, region: true, state: true, arn: true, resourceId: true } },
          },
        },
        workflow: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const def = this.workflows.definitionOf(ticket.workflow);
    const pendingApproval = ticket.approvals.find((a) => a.state === 'PENDING') ?? null;
    const transitions = pendingApproval ? [] : this.transitionsFor(def, ticket.status, user);
    const { workflow, ...rest } = ticket;
    return {
      ...rest,
      statusName: def.statuses.find((s) => s.key === ticket.status)?.name ?? ticket.status,
      workflow: { id: workflow.id, name: workflow.name, version: workflow.version, statuses: def.statuses },
      availableTransitions: transitions,
      pendingApproval,
    };
  }

  private transitionsFor(def: WorkflowDefinition, status: string, user: AuthUser) {
    if (!can(user, 'tickets:transition')) return [];
    const list = this.workflows.available(def, status, user);
    // Requesters may only use transitions that explicitly list them (e.g. "Reopen", "Provide info").
    return user.role === 'REQUESTER'
      ? list.filter((t) => t.allowedRoles?.some((r) => r === 'REQUESTER' || r === user.roleKey))
      : list;
  }

  /** `trustedRouting` lets system callers (service catalog) route to a team even if the user cannot assign. */
  async create(user: AuthUser, dto: CreateTicketDto, opts: { trustedRouting?: boolean } = {}) {
    const wf = await this.workflows.activeForType(dto.type);
    const def = this.workflows.definitionOf(wf);
    const initial = this.workflows.status(def, def.initialStatus);
    const canAssign = can(user, 'tickets:assign');

    const base = {
      title: dto.title,
      description: dto.description,
      type: dto.type,
      priority: dto.priority,
      category: dto.category ?? null,
      tags: dto.tags ?? [],
      teamId: canAssign || opts.trustedRouting ? (dto.teamId ?? null) : null,
      assigneeId: canAssign ? (dto.assigneeId ?? null) : null,
    };
    const { changes, applied } = await this.automation.applyOnCreate(base);
    const merged = { ...base, ...changes };
    let autoAssigned = false;
    if (merged.teamId && !merged.assigneeId) {
      merged.assigneeId = await this.automation.roundRobin(merged.teamId);
      autoAssigned = !!merged.assigneeId;
    }

    const org = dto.organizationId
      ? await this.prisma.organization.findUnique({ where: { id: dto.organizationId } })
      : null;
    const now = new Date();
    const due = await this.sla.dueDates(merged.priority, now, org?.tier, merged.teamId);

    const events: Prisma.TicketEventCreateWithoutTicketInput[] = [
      { type: 'created', actor: { connect: { id: user.id } }, data: { status: initial.key } },
      ...applied.map((rule) => ({ type: 'automation.applied', data: { rule } })),
      ...(autoAssigned ? [{ type: 'auto_assigned', data: { assigneeId: merged.assigneeId, strategy: 'round_robin' } }] : []),
    ];

    const ticket = await this.prisma.ticket.create({
      data: {
        ...merged,
        customFields: (dto.customFields ?? {}) as Prisma.InputJsonValue,
        status: initial.key,
        statusCategory: initial.category,
        slaPausedAt: initial.pausesSla ? now : null,
        workflowId: wf.id,
        requesterId: canAssign ? (dto.requesterId ?? user.id) : user.id,
        catalogItemId: dto.catalogItemId,
        organizationId: dto.organizationId,
        contactId: dto.contactId,
        parentId: dto.parentId,
        ...due,
        events: { create: events },
        assets: dto.assetIds?.length ? { create: dto.assetIds.map((assetId) => ({ assetId })) } : undefined,
      },
    });

    await this.audit.log(user.id, 'ticket.created', 'Ticket', ticket.id, { number: ticket.number });
    const assigneeName = ticket.assigneeId
      ? (await this.prisma.user.findUnique({ where: { id: ticket.assigneeId } }))?.name
      : undefined;
    this.integrations.dispatch('ticket.created', {
      title: `#${ticket.number} ${ticket.title}`,
      text: ticket.description.slice(0, 300),
      link: `/tickets/${ticket.id}`,
      priority: ticket.priority,
      teamId: ticket.teamId,
      fields: [
        ['Type', ticket.type.replace('_', ' ').toLowerCase()],
        ['Assignee', assigneeName ?? 'Unassigned'],
        ['Requester', user.name],
      ],
    });
    await this.notifications.notify(
      [ticket.assigneeId],
      `Assigned: #${ticket.number} ${ticket.title}`,
      `${ticket.priority} ${ticket.type.replace('_', ' ').toLowerCase()}`,
      `/tickets/${ticket.id}`,
      user.id,
    );
    return this.get(ticket.id, user);
  }

  async update(id: string, user: AuthUser, dto: UpdateTicketDto) {
    const ticket = await this.findScoped(id, user);
    const canEdit = can(user, 'tickets:edit');
    for (const field of Object.keys(dto)) {
      if (['assigneeId', 'teamId'].includes(field)) {
        if (!can(user, 'tickets:assign')) throw new ForbiddenException('Missing permission to assign tickets');
      } else if (['title', 'description'].includes(field)) {
        if (!canEdit && ticket.requesterId !== user.id) throw new ForbiddenException('Missing permission to edit tickets');
      } else if (!canEdit) {
        throw new ForbiddenException(`Missing permission to edit ${field}`);
      }
    }

    const data: Prisma.TicketUncheckedUpdateInput = {};
    const events: Prisma.TicketEventCreateManyInput[] = [];
    for (const field of TRACKED_FIELDS) {
      if (!(field in dto)) continue;
      let next = (dto as any)[field];
      if (field === 'customFields') next = { ...(ticket.customFields as object), ...next };
      const prev = (ticket as any)[field];
      if (JSON.stringify(prev ?? null) === JSON.stringify(next ?? null)) continue;
      (data as any)[field] = next;
      events.push({
        ticketId: id,
        actorId: user.id,
        type: 'field.changed',
        data: field === 'description' ? { field } : { field, from: prev ?? null, to: next ?? null },
      });
    }
    if (!events.length) return this.get(id, user);

    if (dto.priority && dto.priority !== ticket.priority && ticket.statusCategory !== 'DONE') {
      const org = ticket.organizationId
        ? await this.prisma.organization.findUnique({ where: { id: ticket.organizationId } })
        : null;
      Object.assign(data, await this.sla.dueDates(dto.priority, ticket.createdAt, org?.tier, ticket.teamId), {
        slaBreached: false,
        slaBreachedAt: null,
        slaWarnedAt: null,
        escalationLevel: 0,
      });
    }

    await this.prisma.$transaction([
      this.prisma.ticket.update({ where: { id }, data }),
      this.prisma.ticketEvent.createMany({ data: events }),
    ]);
    if (dto.assigneeId && dto.assigneeId !== ticket.assigneeId) {
      await this.notifications.notify(
        [dto.assigneeId],
        `Assigned: #${ticket.number} ${ticket.title}`,
        undefined,
        `/tickets/${id}`,
        user.id,
      );
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      this.integrations.dispatch('ticket.assigned', {
        title: `#${ticket.number} assigned to ${assignee?.name ?? 'someone'}`,
        text: ticket.title,
        link: `/tickets/${id}`,
        priority: dto.priority ?? ticket.priority,
        teamId: dto.teamId ?? ticket.teamId,
        fields: [['Assigned by', user.name]],
      });
    }
    await this.audit.log(user.id, 'ticket.updated', 'Ticket', id, { fields: events.map((e: any) => e.data.field) });
    return this.get(id, user);
  }

  async transition(id: string, user: AuthUser, dto: TransitionDto) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, this.scope(user)] },
      include: { workflow: true, approvals: { where: { state: 'PENDING' } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.approvals.length) throw new BadRequestException('Ticket has a pending approval');

    const def = this.workflows.definitionOf(ticket.workflow);
    const t = this.transitionsFor(def, ticket.status, user).find((x) => x.key === dto.transitionKey);
    if (!t) throw new BadRequestException(`Transition "${dto.transitionKey}" is not available`);

    const fieldPatch: Prisma.TicketUncheckedUpdateInput = {};
    if (dto.fields?.assigneeId) fieldPatch.assigneeId = dto.fields.assigneeId;
    if (dto.fields?.category) fieldPatch.category = dto.fields.category;
    if (dto.fields?.customFields) {
      fieldPatch.customFields = { ...(ticket.customFields as object), ...dto.fields.customFields } as Prisma.InputJsonValue;
    }
    const candidate = { ...ticket, ...fieldPatch };
    const missing = (t.requiredFields ?? []).filter((f) => isEmpty(getPath(candidate, f)));
    if (missing.length) throw new BadRequestException(`Required for "${t.name}": ${missing.join(', ')}`);
    if (t.requireComment && !dto.comment?.trim()) throw new BadRequestException(`A comment is required for "${t.name}"`);

    if (dto.comment?.trim()) {
      await this.prisma.comment.create({
        data: { ticketId: id, authorId: user.id, body: dto.comment, internal: can(user, 'tickets:view_internal') },
      });
    }

    if (t.requiresApproval) {
      if (Object.keys(fieldPatch).length) await this.prisma.ticket.update({ where: { id }, data: fieldPatch });
      const approval = await this.prisma.approvalRequest.create({
        data: {
          ticketId: id,
          transitionKey: t.key,
          approverRole: t.requiresApproval.approverRole,
          requestedById: user.id,
        },
      });
      await this.prisma.ticketEvent.create({
        data: { ticketId: id, actorId: user.id, type: 'approval.requested', data: { transition: t.name, approvalId: approval.id } },
      });
      const approvers = await this.access.usersForRoleRef(t.requiresApproval.approverRole);
      await this.notifications.notify(
        approvers.map((a) => a.id),
        `Approval needed: #${ticket.number}`,
        `${user.name} requested "${t.name}" on "${ticket.title}"`,
        `/approvals`,
        user.id,
      );
      this.integrations.dispatch('approval.requested', {
        title: `Approval needed: #${ticket.number} ${ticket.title}`,
        text: `${user.name} requested "${t.name}".`,
        link: `/tickets/${id}`,
        priority: ticket.priority,
        teamId: ticket.teamId,
        fields: [['Approver role', t.requiresApproval.approverRole]],
        approvalId: approval.id,
      });
      return this.get(id, user);
    }

    await this.applyTransition(ticket, def, t, user.id, fieldPatch);
    return this.get(id, user);
  }

  /** Moves the ticket to the transition's target status and maintains resolution/SLA bookkeeping. */
  async applyTransition(
    ticket: Ticket,
    def: WorkflowDefinition,
    t: WorkflowTransition,
    actorId: string | null,
    extra: Prisma.TicketUncheckedUpdateInput = {},
  ) {
    const from = this.workflows.status(def, ticket.status);
    const to = this.workflows.status(def, t.to);
    const now = new Date();
    const data: Prisma.TicketUncheckedUpdateInput = { ...extra, status: to.key, statusCategory: to.category };

    if (to.category === 'DONE') {
      if (!ticket.resolvedAt) data.resolvedAt = now;
      if (to.key === 'closed') data.closedAt = now;
    } else {
      data.resolvedAt = null;
      data.closedAt = null;
    }

    if (to.pausesSla && !ticket.slaPausedAt) data.slaPausedAt = now;
    if (!to.pausesSla && ticket.slaPausedAt) Object.assign(data, await this.sla.resumeDueDates(ticket, now));

    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ...data,
        events: {
          create: {
            actorId,
            type: 'status.changed',
            data: { from: from.key, fromName: from.name, to: to.key, toName: to.name, transition: t.name },
          },
        },
      } as Prisma.TicketUncheckedUpdateInput,
    });
    await this.notifications.notify(
      [ticket.requesterId, ticket.assigneeId],
      `#${ticket.number} is now ${to.name}`,
      ticket.title,
      `/tickets/${ticket.id}`,
      actorId ?? undefined,
    );
    if (actorId) await this.audit.log(actorId, 'ticket.transitioned', 'Ticket', ticket.id, { from: from.key, to: to.key });
    this.integrations.dispatch('ticket.status_changed', {
      title: `#${ticket.number} ${from.name} → ${to.name}`,
      text: ticket.title,
      link: `/tickets/${ticket.id}`,
      priority: ticket.priority,
      teamId: ticket.teamId,
    });
  }

  async addComment(id: string, user: AuthUser, dto: CommentDto) {
    const ticket = await this.findScoped(id, user);
    const internal = can(user, 'tickets:view_internal') ? !!dto.internal : false;
    const comment = await this.prisma.comment.create({
      data: { ticketId: id, authorId: user.id, body: dto.body, internal },
      include: { author: userBrief },
    });

    const isAgentReply = !internal && user.id !== ticket.requesterId && user.role !== 'REQUESTER';
    if (isAgentReply && !ticket.firstRespondedAt) {
      await this.prisma.ticket.update({ where: { id }, data: { firstRespondedAt: new Date() } });
    }

    const mentionedEmails = [...dto.body.matchAll(/@([\w.+-]+@[\w-]+\.[\w.-]+)/g)].map((m) => m[1].toLowerCase());
    const mentioned = mentionedEmails.length
      ? await this.prisma.user.findMany({ where: { email: { in: mentionedEmails } }, select: { id: true } })
      : [];
    await this.notifications.notify(
      [ticket.assigneeId, internal ? null : ticket.requesterId, ...mentioned.map((m) => m.id)],
      `${internal ? 'Internal note' : 'New reply'} on #${ticket.number}`,
      dto.body.slice(0, 140),
      `/tickets/${id}`,
      user.id,
    );
    return comment;
  }

  async linkAsset(id: string, user: AuthUser, assetId: string) {
    await this.findScoped(id, user);
    await this.prisma.ticketAsset.upsert({
      where: { ticketId_assetId: { ticketId: id, assetId } },
      create: { ticketId: id, assetId },
      update: {},
    });
    await this.prisma.ticketEvent.create({ data: { ticketId: id, actorId: user.id, type: 'asset.linked', data: { assetId } } });
    return this.get(id, user);
  }

  async unlinkAsset(id: string, user: AuthUser, assetId: string) {
    await this.findScoped(id, user);
    await this.prisma.ticketAsset.deleteMany({ where: { ticketId: id, assetId } });
    await this.prisma.ticketEvent.create({ data: { ticketId: id, actorId: user.id, type: 'asset.unlinked', data: { assetId } } });
    return this.get(id, user);
  }

  // ─── Approvals ───────────────────────────────────────────────────────────

  pendingApprovals(user: AuthUser) {
    return this.prisma.approvalRequest.findMany({
      where: { state: 'PENDING', ...(user.role === 'ADMIN' ? {} : { approverRole: { in: [user.roleKey, user.role] } }) },
      include: {
        ticket: { select: { id: true, number: true, title: true, priority: true, type: true, status: true } },
        requestedBy: userBrief,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async decideApproval(approvalId: string, user: AuthUser, approve: boolean, comment?: string) {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id: approvalId },
      include: { ticket: { include: { workflow: true } } },
    });
    if (!approval) throw new NotFoundException('Approval not found');
    if (approval.state !== 'PENDING') throw new BadRequestException('Approval already decided');
    if (!matchesRole(user, approval.approverRole)) {
      throw new ForbiddenException('You are not an approver for this request');
    }
    if (approval.requestedById === user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You cannot approve your own request');
    }

    await this.prisma.approvalRequest.update({
      where: { id: approvalId },
      data: { state: approve ? 'APPROVED' : 'REJECTED', decidedById: user.id, decidedAt: new Date(), comment },
    });
    const ticket = approval.ticket;
    await this.prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: user.id,
        type: approve ? 'approval.approved' : 'approval.rejected',
        data: { approvalId, comment: comment ?? null },
      },
    });
    await this.audit.log(user.id, approve ? 'approval.approved' : 'approval.rejected', 'Ticket', ticket.id, { approvalId });
    this.integrations.dispatch('approval.decided', {
      title: `${approve ? 'Approved' : 'Rejected'}: #${ticket.number} ${ticket.title}`,
      text: `${user.name}${comment ? ` — “${comment}”` : ''}`,
      link: `/tickets/${ticket.id}`,
      priority: ticket.priority,
      teamId: ticket.teamId,
    });

    if (approve) {
      const def = this.workflows.definitionOf(ticket.workflow as Workflow);
      const t = def.transitions.find((x) => x.key === approval.transitionKey);
      if (t) await this.applyTransition(ticket, def, t, user.id);
    } else {
      await this.notifications.notify(
        [approval.requestedById, ticket.assigneeId],
        `Approval rejected: #${ticket.number}`,
        comment ?? ticket.title,
        `/tickets/${ticket.id}`,
        user.id,
      );
    }
    return { ok: true };
  }

  private async findScoped(id: string, user: AuthUser) {
    const ticket = await this.prisma.ticket.findFirst({ where: { AND: [{ id }, this.scope(user)] } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }
}

function getPath(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isEmpty(v: unknown) {
  return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
}
