import { Injectable, Logger } from '@nestjs/common';
import { IntegrationChannel, Priority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const INTEGRATION_EVENTS = [
  { key: 'ticket.created', label: 'Ticket created' },
  { key: 'ticket.assigned', label: 'Ticket assigned' },
  { key: 'ticket.status_changed', label: 'Ticket status changed' },
  { key: 'sla.warning', label: 'SLA at risk (pre-breach warning)' },
  { key: 'sla.breached', label: 'SLA breached' },
  { key: 'sla.escalated', label: 'SLA escalation fired' },
  { key: 'approval.requested', label: 'Approval requested (with Approve/Reject buttons)' },
  { key: 'approval.decided', label: 'Approval decided' },
  { key: 'kb.published', label: 'Knowledge article published' },
] as const;

export type IntegrationEvent = (typeof INTEGRATION_EVENTS)[number]['key'];

export interface IntegrationMessage {
  title: string;
  text?: string;
  /** App-relative path, e.g. /tickets/abc */
  link?: string;
  priority?: Priority | null;
  teamId?: string | null;
  fields?: [string, string][];
  /** Renders Approve / Reject buttons (Slack apps with interactivity enabled). */
  approvalId?: string;
}

const EMOJI: Record<string, string> = {
  'ticket.created': ':ticket:',
  'ticket.assigned': ':bust_in_silhouette:',
  'ticket.status_changed': ':arrows_counterclockwise:',
  'sla.warning': ':warning:',
  'sla.breached': ':rotating_light:',
  'sla.escalated': ':chart_with_upwards_trend:',
  'approval.requested': ':shield:',
  'approval.decided': ':white_check_mark:',
  'kb.published': ':blue_book:',
  test: ':wave:',
};

const PRIORITY_COLOR: Record<Priority, string> = { P1: 'DC2626', P2: 'EA580C', P3: '0284C7', P4: '64748B' };

const escapeSlack = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(private prisma: PrismaService) {}

  get appUrl() {
    return (process.env.APP_URL ?? process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  /** Fire-and-forget fan-out to every enabled channel subscribed to the event and matching its filters. */
  dispatch(event: IntegrationEvent, msg: IntegrationMessage) {
    this.deliver(event, msg).catch((err) => this.logger.error(`Dispatch ${event} failed: ${err.message}`));
  }

  private async deliver(event: IntegrationEvent, msg: IntegrationMessage) {
    const channels = await this.prisma.integrationChannel.findMany({ where: { enabled: true, events: { has: event } } });
    await Promise.all(
      channels
        .filter((c) => !c.priorities.length || (msg.priority && c.priorities.includes(msg.priority)))
        .filter((c) => !c.teamIds.length || (msg.teamId && c.teamIds.includes(msg.teamId)))
        .map((c) => this.send(c, event, msg).catch(() => undefined)),
    );
  }

  async send(channel: IntegrationChannel, event: string, msg: IntegrationMessage) {
    const body = channel.kind === 'SLACK' ? this.slackPayload(event, msg) : this.teamsPayload(event, msg);
    try {
      const res = await fetch(channel.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      await this.prisma.integrationChannel.update({
        where: { id: channel.id },
        data: { lastDeliveryAt: new Date(), lastError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.integrationChannel.update({ where: { id: channel.id }, data: { lastError: message } });
      this.logger.warn(`Delivery to ${channel.name} failed: ${message}`);
      throw err;
    }
  }

  private slackPayload(event: string, msg: IntegrationMessage) {
    const url = msg.link ? this.appUrl + msg.link : undefined;
    const blocks: any[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${EMOJI[event] ?? ''} *${escapeSlack(msg.title)}*${msg.text ? `\n${escapeSlack(msg.text)}` : ''}`,
        },
      },
    ];
    const fields = [...(msg.priority ? ([['Priority', msg.priority]] as [string, string][]) : []), ...(msg.fields ?? [])];
    if (fields.length) {
      blocks.push({
        type: 'section',
        fields: fields.slice(0, 10).map(([k, v]) => ({ type: 'mrkdwn', text: `*${escapeSlack(k)}*\n${escapeSlack(v)}` })),
      });
    }
    const buttons: any[] = [];
    if (msg.approvalId) {
      buttons.push(
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Approve' }, action_id: 'cg_approve', value: msg.approvalId },
        { type: 'button', style: 'danger', text: { type: 'plain_text', text: 'Reject' }, action_id: 'cg_reject', value: msg.approvalId },
      );
    }
    if (url) buttons.push({ type: 'button', text: { type: 'plain_text', text: 'Open in CloudGuardian' }, url, action_id: 'cg_open' });
    if (buttons.length) blocks.push({ type: 'actions', elements: buttons });
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `CloudGuardian · ${event}` }] });
    return { text: msg.title, blocks };
  }

  private teamsPayload(event: string, msg: IntegrationMessage) {
    const url = msg.link ? this.appUrl + msg.link : undefined;
    const facts = [...(msg.priority ? ([['Priority', msg.priority]] as [string, string][]) : []), ...(msg.fields ?? [])];
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: msg.title,
      themeColor: msg.priority ? PRIORITY_COLOR[msg.priority] : '4F46E5',
      title: msg.title,
      text: msg.text ?? '',
      sections: facts.length ? [{ facts: facts.map(([name, value]) => ({ name, value })) }] : [],
      potentialAction: url ? [{ '@type': 'OpenUri', name: 'Open in CloudGuardian', targets: [{ os: 'default', uri: url }] }] : [],
    };
  }
}
