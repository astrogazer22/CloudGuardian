import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Logger,
  Module,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Priority, TicketType } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { AccessService } from '../auth/access.service';
import { Public } from '../auth/decorators';
import { AuthUser, can } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsModule } from '../tickets/tickets.module';
import { TicketsService } from '../tickets/tickets.service';
import { IntegrationsService } from './integrations.service';

const HELP = [
  '*CloudGuardian commands*',
  '`/cg new [P1-P4] [incident|request|change|task] Title | optional description` — open a ticket',
  '`/cg status 123` — status of ticket #123',
  '`/cg mine` — your open assigned tickets',
].join('\n');

const TYPE_ALIASES: Record<string, TicketType> = {
  incident: 'INCIDENT',
  request: 'SERVICE_REQUEST',
  change: 'CHANGE',
  problem: 'PROBLEM',
  task: 'TASK',
};

const ephemeral = (text: string) => ({ response_type: 'ephemeral', text });

/**
 * Inbound Slack endpoints (slash command + interactive buttons). Requests are authenticated with
 * Slack's signing secret; Slack users are mapped to CloudGuardian users by email via the bot token.
 */
@Controller('integrations/slack')
class SlackController {
  private readonly logger = new Logger(SlackController.name);
  private readonly userCache = new Map<string, { userId: string | null; at: number }>();

  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private tickets: TicketsService,
    private integrations: IntegrationsService,
  ) {}

  @Public()
  @Post('commands')
  @HttpCode(200)
  async command(@Req() req: RawBodyRequest<Request>, @Body() body: Record<string, string>) {
    this.verify(req);
    const user = await this.resolveUser(body.user_id);
    if (!user) return ephemeral('Your Slack account is not linked to a CloudGuardian user (matched by email).');

    const text = (body.text ?? '').trim();
    const [sub, ...rest] = text.split(/\s+/);
    switch ((sub ?? '').toLowerCase()) {
      case 'new':
        return this.newTicket(user, rest);
      case 'status':
        return this.status(user, rest[0]);
      case 'mine':
        return this.mine(user);
      default:
        return ephemeral(HELP);
    }
  }

  @Public()
  @Post('interactions')
  @HttpCode(200)
  async interaction(@Req() req: RawBodyRequest<Request>, @Body() body: Record<string, string>) {
    this.verify(req);
    const payload = JSON.parse(body.payload ?? '{}');
    const action = payload.actions?.[0];
    if (!action || !['cg_approve', 'cg_reject'].includes(action.action_id)) return {};

    const reply = (text: string, replace = false) =>
      payload.response_url &&
      fetch(payload.response_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, response_type: 'in_channel', replace_original: replace }),
      }).catch(() => undefined);

    const user = await this.resolveUser(payload.user?.id);
    if (!user || !can(user, 'approvals:decide')) {
      await reply(':no_entry: You are not allowed to decide CloudGuardian approvals.');
      return {};
    }
    const approve = action.action_id === 'cg_approve';
    try {
      await this.tickets.decideApproval(action.value, user, approve, `Decided in Slack by ${user.name}`);
      await reply(`${approve ? ':white_check_mark: Approved' : ':x: Rejected'} by ${user.name}`, true);
    } catch (err) {
      await reply(`:warning: ${err instanceof Error ? err.message : 'Could not record decision'}`);
    }
    return {};
  }

  private async newTicket(user: AuthUser, args: string[]) {
    if (!can(user, 'tickets:create')) return ephemeral('You do not have permission to create tickets.');
    let priority: Priority = 'P3';
    let type: TicketType = 'INCIDENT';
    while (args.length) {
      const a = args[0].toLowerCase();
      if (/^p[1-4]$/.test(a)) priority = a.toUpperCase() as Priority;
      else if (TYPE_ALIASES[a]) type = TYPE_ALIASES[a];
      else break;
      args.shift();
    }
    const [title, ...desc] = args.join(' ').split('|');
    if (!title || title.trim().length < 3) return ephemeral('Usage: `/cg new [P1-P4] [incident|request|change|task] Title | description`');
    const ticket = await this.tickets.create(user, {
      title: title.trim(),
      description: desc.join('|').trim() || `Raised from Slack by ${user.name}.`,
      type,
      priority,
      tags: ['slack'],
    });
    return {
      response_type: 'in_channel',
      text: `:ticket: ${user.name} opened <${this.integrations.appUrl}/tickets/${ticket.id}|#${ticket.number} ${ticket.title}> (${priority}, assigned to ${ticket.assignee?.name ?? 'nobody yet'})`,
    };
  }

  private async status(user: AuthUser, raw?: string) {
    const number = Number((raw ?? '').replace('#', ''));
    if (!Number.isInteger(number) || number < 1) return ephemeral('Usage: `/cg status 123`');
    const t = await this.prisma.ticket.findFirst({
      where: { AND: [{ number }, this.access.ticketWhere(user)] },
      include: { assignee: true, workflow: true },
    });
    if (!t) return ephemeral(`Ticket #${number} not found.`);
    const def = t.workflow.definition as any;
    const status = def.statuses.find((s: any) => s.key === t.status)?.name ?? t.status;
    const sla = t.slaBreached ? ':rotating_light: SLA breached' : t.resolutionDueAt ? `due ${t.resolutionDueAt.toISOString()}` : '';
    return ephemeral(
      `<${this.integrations.appUrl}/tickets/${t.id}|#${t.number} ${t.title}>\n*${status}* · ${t.priority} · ${t.assignee?.name ?? 'Unassigned'} ${sla}`,
    );
  }

  private async mine(user: AuthUser) {
    const list = await this.prisma.ticket.findMany({
      where: { assigneeId: user.id, statusCategory: { not: 'DONE' } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: 10,
    });
    if (!list.length) return ephemeral('You have no open assigned tickets. :tada:');
    return ephemeral(list.map((t) => `• <${this.integrations.appUrl}/tickets/${t.id}|#${t.number}> ${t.priority} ${t.title}`).join('\n'));
  }

  private verify(req: RawBodyRequest<Request>) {
    const secret = process.env.SLACK_SIGNING_SECRET;
    if (!secret) throw new ForbiddenException('Slack integration is not configured');
    const ts = req.headers['x-slack-request-timestamp'] as string | undefined;
    const sig = req.headers['x-slack-signature'] as string | undefined;
    if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300 || !req.rawBody) {
      throw new UnauthorizedException('Invalid Slack request');
    }
    const expected = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${req.rawBody.toString('utf8')}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid Slack signature');
  }

  private async resolveUser(slackUserId?: string): Promise<AuthUser | null> {
    if (!slackUserId) return null;
    const cached = this.userCache.get(slackUserId);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.userId ? this.access.load(cached.userId) : null;

    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) return null;
    let userId: string | null = null;
    try {
      const res = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as { user?: { profile?: { email?: string } } };
      const email = data?.user?.profile?.email?.toLowerCase();
      if (email) userId = (await this.prisma.user.findUnique({ where: { email } }))?.id ?? null;
    } catch (err) {
      this.logger.warn(`Slack users.info failed: ${err instanceof Error ? err.message : err}`);
    }
    this.userCache.set(slackUserId, { userId, at: Date.now() });
    return userId ? this.access.load(userId) : null;
  }
}

@Module({ imports: [TicketsModule], controllers: [SlackController] })
export class SlackModule {}
