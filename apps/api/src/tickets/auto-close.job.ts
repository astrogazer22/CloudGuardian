import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { TicketsService } from './tickets.service';

const AUTO_CLOSE_DAYS = Number(process.env.AUTO_CLOSE_DAYS ?? 7);

/** Closes tickets that have sat in "resolved" for AUTO_CLOSE_DAYS with no reopen. */
@Injectable()
export class AutoCloseJob {
  private readonly logger = new Logger(AutoCloseJob.name);

  constructor(
    private prisma: PrismaService,
    private workflows: WorkflowsService,
    private tickets: TicketsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    if (process.env.RUN_WORKERS === 'false') return;
    const cutoff = new Date(Date.now() - AUTO_CLOSE_DAYS * 86_400_000);
    const stale = await this.prisma.ticket.findMany({
      where: { status: 'resolved', resolvedAt: { lt: cutoff } },
      include: { workflow: true },
    });
    let closed = 0;
    for (const ticket of stale) {
      const def = this.workflows.definitionOf(ticket.workflow);
      const t = def.transitions.find((x) => x.to === 'closed' && (x.from.includes('resolved') || x.from.includes('*')));
      if (!t) continue;
      await this.tickets.applyTransition(ticket, def, t, null);
      closed++;
    }
    if (closed) this.logger.log(`Auto-closed ${closed} ticket(s)`);
  }
}
