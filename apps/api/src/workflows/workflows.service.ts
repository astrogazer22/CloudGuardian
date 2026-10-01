import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketType, Workflow } from '@prisma/client';
import { AuthUser, matchesRole } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowDefinition, WorkflowStatus, WorkflowTransition } from './workflow.types';

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  /** Latest version of each workflow name. */
  async listLatest() {
    const all = await this.prisma.workflow.findMany({
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
      include: { _count: { select: { tickets: true } } },
    });
    const seen = new Set<string>();
    return all.filter((w) => (seen.has(w.name) ? false : (seen.add(w.name), true)));
  }

  versions(name: string) {
    return this.prisma.workflow.findMany({ where: { name }, orderBy: { version: 'desc' } });
  }

  async get(id: string) {
    const wf = await this.prisma.workflow.findUnique({ where: { id } });
    if (!wf) throw new NotFoundException('Workflow not found');
    return wf;
  }

  async activeForType(type: TicketType): Promise<Workflow> {
    const wf = await this.prisma.workflow.findFirst({
      where: { ticketType: type, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!wf) throw new BadRequestException(`No active workflow configured for ${type}`);
    return wf;
  }

  /**
   * Publishes a new immutable version. Existing tickets stay pinned to the version they
   * were created with; new tickets of this type use the new version.
   */
  async publish(name: string, ticketType: TicketType, definition: WorkflowDefinition, description?: string) {
    this.validate(definition);
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.workflow.findFirst({ where: { name }, orderBy: { version: 'desc' } });
      await tx.workflow.updateMany({ where: { OR: [{ name }, { ticketType }] }, data: { isActive: false } });
      return tx.workflow.create({
        data: {
          name,
          ticketType,
          description: description ?? latest?.description,
          version: (latest?.version ?? 0) + 1,
          definition: definition as any,
          isActive: true,
        },
      });
    });
  }

  validate(def: WorkflowDefinition) {
    if (!def || !Array.isArray(def.statuses) || !Array.isArray(def.transitions)) {
      throw new BadRequestException('Definition must include statuses[] and transitions[]');
    }
    const keys = new Set<string>();
    for (const s of def.statuses) {
      if (!s.key || !s.name) throw new BadRequestException('Every status needs a key and name');
      if (!['TODO', 'IN_PROGRESS', 'DONE'].includes(s.category)) {
        throw new BadRequestException(`Status "${s.key}" has invalid category`);
      }
      if (keys.has(s.key)) throw new BadRequestException(`Duplicate status "${s.key}"`);
      keys.add(s.key);
    }
    if (!keys.has(def.initialStatus)) throw new BadRequestException('initialStatus must reference a status');
    const tKeys = new Set<string>();
    for (const t of def.transitions) {
      if (!t.key || !t.name) throw new BadRequestException('Every transition needs a key and name');
      if (tKeys.has(t.key)) throw new BadRequestException(`Duplicate transition "${t.key}"`);
      tKeys.add(t.key);
      if (!keys.has(t.to)) throw new BadRequestException(`Transition "${t.key}" targets unknown status "${t.to}"`);
      for (const f of t.from ?? []) {
        if (f !== '*' && !keys.has(f)) throw new BadRequestException(`Transition "${t.key}" from unknown status "${f}"`);
      }
    }
  }

  definitionOf(wf: Workflow): WorkflowDefinition {
    return wf.definition as unknown as WorkflowDefinition;
  }

  status(def: WorkflowDefinition, key: string): WorkflowStatus {
    const s = def.statuses.find((st) => st.key === key);
    if (!s) throw new BadRequestException(`Unknown status "${key}"`);
    return s;
  }

  /** Transitions leaving `statusKey` that the user is permitted to trigger. */
  available(def: WorkflowDefinition, statusKey: string, user: AuthUser): WorkflowTransition[] {
    return def.transitions.filter(
      (t) =>
        t.to !== statusKey &&
        (t.from.includes('*') || t.from.includes(statusKey)) &&
        (!t.allowedRoles?.length || t.allowedRoles.some((r) => matchesRole(user, r))),
    );
  }
}
