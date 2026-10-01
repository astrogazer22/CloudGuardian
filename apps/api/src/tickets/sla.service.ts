import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BusinessCalendar, CustomerTier, Priority, Ticket } from '@prisma/client';
import { IntegrationsService } from '../integrations/integrations.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { addBusinessTime, businessTimeBetween } from './business-time';

const DEFAULT_MINS: Record<Priority, [number, number]> = {
  P1: [15, 4 * 60],
  P2: [60, 8 * 60],
  P3: [4 * 60, 3 * 24 * 60],
  P4: [8 * 60, 7 * 24 * 60],
};

/** Higher customer tiers get proportionally tighter targets. */
const TIER_FACTOR: Record<CustomerTier, number> = { STANDARD: 1, PREMIUM: 0.75, ENTERPRISE: 0.5 };

const NEXT_PRIORITY: Record<Priority, Priority> = { P1: 'P1', P2: 'P1', P3: 'P2', P4: 'P3' };

export interface EscalationLevel {
  afterMins: number;
  notify?: ('assignee' | 'team' | 'team_lead' | 'admins')[];
  userIds?: string[];
  bumpPriority?: boolean;
  reassignToLead?: boolean;
}

@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private integrations: IntegrationsService,
  ) {}

  private get workersEnabled() {
    return process.env.RUN_WORKERS !== 'false';
  }

  async calendarFor(teamId?: string | null): Promise<BusinessCalendar | null> {
    if (teamId) {
      const team = await this.prisma.team.findUnique({ where: { id: teamId }, include: { calendar: true } });
      if (team?.calendar) return team.calendar;
    }
    return this.prisma.businessCalendar.findFirst({ where: { isDefault: true } });
  }

  async dueDates(priority: Priority, from: Date, tier?: CustomerTier | null, teamId?: string | null) {
    const policy = await this.prisma.slaPolicy.findUnique({ where: { priority } });
    const [resp, reso] = policy ? [policy.firstResponseMins, policy.resolutionMins] : DEFAULT_MINS[priority];
    const factor = TIER_FACTOR[tier ?? 'STANDARD'];
    const respMs = resp * factor * 60_000;
    const resoMs = reso * factor * 60_000;
    const cal = policy?.businessHours ? await this.calendarFor(teamId) : null;
    if (cal) {
      return { responseDueAt: addBusinessTime(from, respMs, cal), resolutionDueAt: addBusinessTime(from, resoMs, cal) };
    }
    return { responseDueAt: new Date(from.getTime() + respMs), resolutionDueAt: new Date(from.getTime() + resoMs) };
  }

  /** New due dates when a paused SLA clock resumes: the remaining working time is carried forward from now. */
  async resumeDueDates(ticket: Ticket, now: Date) {
    if (!ticket.slaPausedAt) return {};
    const pausedAt = ticket.slaPausedAt;
    const policy = await this.prisma.slaPolicy.findUnique({ where: { priority: ticket.priority } });
    const cal = policy?.businessHours ? await this.calendarFor(ticket.teamId) : null;
    const shift = (due: Date) =>
      cal
        ? addBusinessTime(now, businessTimeBetween(pausedAt, due, cal), cal)
        : new Date(due.getTime() + (now.getTime() - pausedAt.getTime()));
    return {
      slaPausedAt: null,
      ...(ticket.responseDueAt && !ticket.firstRespondedAt ? { responseDueAt: shift(ticket.responseDueAt) } : {}),
      ...(ticket.resolutionDueAt ? { resolutionDueAt: shift(ticket.resolutionDueAt) } : {}),
    };
  }

  @Interval('sla-monitor', 60_000)
  async monitor() {
    if (!this.workersEnabled) return;
    await this.sendWarnings();
    await this.markBreaches();
    await this.escalate();
  }

  private async sendWarnings() {
    const policies = await this.prisma.slaPolicy.findMany();
    const warnFor = (p: Priority) => (policies.find((x) => x.priority === p)?.warnBeforeMins ?? 30) * 60_000;
    const maxWarn = Math.max(30 * 60_000, ...policies.map((p) => p.warnBeforeMins * 60_000));
    const now = Date.now();
    const horizon = new Date(now + maxWarn);

    const candidates = await this.prisma.ticket.findMany({
      where: {
        statusCategory: { not: 'DONE' },
        slaBreached: false,
        slaWarnedAt: null,
        slaPausedAt: null,
        OR: [{ firstRespondedAt: null, responseDueAt: { lt: horizon } }, { resolutionDueAt: { lt: horizon } }],
      },
      include: { team: { include: { members: true } } },
    });
    for (const t of candidates) {
      const threshold = now + warnFor(t.priority);
      const responseSoon = !t.firstRespondedAt && t.responseDueAt && t.responseDueAt.getTime() < threshold;
      const resolutionSoon = t.resolutionDueAt && t.resolutionDueAt.getTime() < threshold;
      if (!responseSoon && !resolutionSoon) continue;
      const kind = responseSoon ? 'first_response' : 'resolution';
      const due = (responseSoon ? t.responseDueAt : t.resolutionDueAt)!;
      const mins = Math.max(0, Math.round((due.getTime() - now) / 60_000));

      await this.prisma.ticket.update({
        where: { id: t.id },
        data: { slaWarnedAt: new Date(), events: { create: { type: 'sla.warning', data: { kind, minutesLeft: mins } } } },
      });
      const recipients = t.assigneeId ? [t.assigneeId] : (t.team?.members.map((m) => m.userId) ?? []);
      const title = `SLA at risk: #${t.number} — ${mins} min left`;
      await this.notifications.notify(recipients, title, `${kind.replace('_', ' ')} target for "${t.title}"`, `/tickets/${t.id}`);
      this.integrations.dispatch('sla.warning', {
        title,
        text: t.title,
        link: `/tickets/${t.id}`,
        priority: t.priority,
        teamId: t.teamId,
        fields: [['Target', kind.replace('_', ' ')], ['Due', due.toISOString()]],
      });
    }
  }

  private async markBreaches() {
    const now = new Date();
    const breached = await this.prisma.ticket.findMany({
      where: {
        statusCategory: { not: 'DONE' },
        slaBreached: false,
        slaPausedAt: null,
        OR: [{ firstRespondedAt: null, responseDueAt: { lt: now } }, { resolutionDueAt: { lt: now } }],
      },
      include: { team: { include: { members: true } } },
    });
    for (const t of breached) {
      const kind = t.resolutionDueAt && t.resolutionDueAt < now ? 'resolution' : 'first_response';
      await this.prisma.ticket.update({
        where: { id: t.id },
        data: { slaBreached: true, slaBreachedAt: now, events: { create: { type: 'sla.breached', data: { kind } } } },
      });
      const title = `SLA breached: #${t.number}`;
      await this.notifications.notify(
        [t.assigneeId, ...(t.team?.members.map((m) => m.userId) ?? [])],
        title,
        `${kind.replace('_', ' ')} target missed on "${t.title}"`,
        `/tickets/${t.id}`,
      );
      this.integrations.dispatch('sla.breached', {
        title,
        text: t.title,
        link: `/tickets/${t.id}`,
        priority: t.priority,
        teamId: t.teamId,
        fields: [['Missed target', kind.replace('_', ' ')]],
      });
    }
    if (breached.length) this.logger.warn(`Marked ${breached.length} ticket(s) as SLA breached`);
  }

  private async escalate() {
    const policies = await this.prisma.escalationPolicy.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } });
    if (!policies.length) return;
    const now = Date.now();
    const tickets = await this.prisma.ticket.findMany({
      where: { statusCategory: { not: 'DONE' }, slaBreached: true, slaBreachedAt: { not: null } },
      include: { team: { include: { members: true } } },
    });

    for (const t of tickets) {
      const policy = policies.find((p) => !p.priorities.length || p.priorities.includes(t.priority));
      const levels = (policy?.levels ?? []) as unknown as EscalationLevel[];
      const level = levels[t.escalationLevel];
      if (!policy || !level || now - t.slaBreachedAt!.getTime() < level.afterMins * 60_000) continue;

      const recipients = new Set<string>(level.userIds ?? []);
      for (const target of level.notify ?? []) {
        if (target === 'assignee' && t.assigneeId) recipients.add(t.assigneeId);
        if (target === 'team') t.team?.members.forEach((m) => recipients.add(m.userId));
        if (target === 'team_lead' && t.team?.leadId) recipients.add(t.team.leadId);
        if (target === 'admins') {
          const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
          admins.forEach((a) => recipients.add(a.id));
        }
      }

      const actions: string[] = [];
      const data: { escalationLevel: number; priority?: Priority; assigneeId?: string } = { escalationLevel: t.escalationLevel + 1 };
      if (level.bumpPriority && NEXT_PRIORITY[t.priority] !== t.priority) {
        data.priority = NEXT_PRIORITY[t.priority];
        actions.push(`priority ${t.priority} → ${data.priority}`);
      }
      if (level.reassignToLead && t.team?.leadId && t.team.leadId !== t.assigneeId) {
        data.assigneeId = t.team.leadId;
        recipients.add(t.team.leadId);
        actions.push('reassigned to team lead');
      }

      await this.prisma.ticket.update({
        where: { id: t.id },
        data: {
          ...data,
          events: {
            create: { type: 'sla.escalated', data: { level: data.escalationLevel, policy: policy.name, actions } },
          },
        },
      });
      const title = `Escalation L${data.escalationLevel}: #${t.number}`;
      const body = `${t.title}${actions.length ? ` — ${actions.join(', ')}` : ''}`;
      await this.notifications.notify([...recipients], title, body, `/tickets/${t.id}`);
      this.integrations.dispatch('sla.escalated', {
        title,
        text: body,
        link: `/tickets/${t.id}`,
        priority: data.priority ?? t.priority,
        teamId: t.teamId,
        fields: [['Policy', policy.name], ['Level', String(data.escalationLevel)]],
      });
      this.logger.warn(`Escalated #${t.number} to level ${data.escalationLevel} (${policy.name})`);
    }
  }
}
