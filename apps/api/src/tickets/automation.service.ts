import { Injectable } from '@nestjs/common';
import { Priority, TicketType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface RuleConditions {
  type?: TicketType[];
  priority?: Priority[];
  category?: string[];
  titleContains?: string;
}

interface RuleActions {
  teamId?: string;
  assigneeId?: string;
  priority?: Priority;
  addTags?: string[];
}

export interface AutomationSubject {
  type: TicketType;
  priority: Priority;
  title: string;
  category?: string | null;
  teamId?: string | null;
  assigneeId?: string | null;
  tags?: string[];
}

@Injectable()
export class AutomationService {
  constructor(private prisma: PrismaService) {}

  /** Evaluates enabled "ticket.created" rules in order; later rules see earlier rules' changes. */
  async applyOnCreate(subject: AutomationSubject) {
    const rules = await this.prisma.automationRule.findMany({
      where: { enabled: true, trigger: 'ticket.created' },
      orderBy: { sortOrder: 'asc' },
    });
    const changes: Partial<AutomationSubject> = {};
    const applied: string[] = [];
    for (const rule of rules) {
      const cur = { ...subject, ...changes };
      const c = rule.conditions as RuleConditions;
      if (c.type?.length && !c.type.includes(cur.type)) continue;
      if (c.priority?.length && !c.priority.includes(cur.priority)) continue;
      if (c.category?.length && !c.category.some((x) => x.toLowerCase() === cur.category?.toLowerCase())) continue;
      if (c.titleContains && !cur.title.toLowerCase().includes(c.titleContains.toLowerCase())) continue;

      const a = rule.actions as RuleActions;
      if (a.teamId) changes.teamId = a.teamId;
      if (a.assigneeId) changes.assigneeId = a.assigneeId;
      if (a.priority) changes.priority = a.priority;
      if (a.addTags?.length) changes.tags = [...new Set([...(cur.tags ?? []), ...a.addTags])];
      applied.push(rule.name);
    }
    return { changes, applied };
  }

  /** Picks the active agent in the team who was assigned least recently. */
  async roundRobin(teamId: string): Promise<string | null> {
    const members = await this.prisma.teamMember.findMany({
      where: { teamId, user: { active: true, role: { in: ['AGENT', 'ADMIN'] } } },
      include: { user: true },
    });
    if (!members.length) return null;
    members.sort((a, b) => (a.user.lastAssignedAt?.getTime() ?? 0) - (b.user.lastAssignedAt?.getTime() ?? 0));
    const pick = members[0].user;
    await this.prisma.user.update({ where: { id: pick.id }, data: { lastAssignedAt: new Date() } });
    return pick.id;
  }
}
