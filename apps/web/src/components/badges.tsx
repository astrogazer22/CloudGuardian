'use client';

import { AlertTriangle, Clock, PauseCircle } from 'lucide-react';
import { formatDuration, humanize } from '@/lib/format';
import type { AssetType, Priority, StatusCategory, TicketType } from '@/lib/types';
import { Badge, Tone } from './ui';

const PRIORITY_TONE: Record<Priority, Tone> = { P1: 'red', P2: 'orange', P3: 'blue', P4: 'slate' };
const PRIORITY_LABEL: Record<Priority, string> = { P1: 'P1 Critical', P2: 'P2 High', P3: 'P3 Medium', P4: 'P4 Low' };

export function PriorityBadge({ priority, short }: { priority: Priority; short?: boolean }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{short ? priority : PRIORITY_LABEL[priority]}</Badge>;
}

export function StatusBadge({ category, name }: { category: StatusCategory; name: string }) {
  const tone: Tone = category === 'DONE' ? 'green' : category === 'IN_PROGRESS' ? 'indigo' : 'slate';
  return <Badge tone={tone}>{name}</Badge>;
}

const TYPE_TONE: Record<TicketType, Tone> = {
  INCIDENT: 'red',
  SERVICE_REQUEST: 'blue',
  CHANGE: 'purple',
  PROBLEM: 'amber',
  TASK: 'slate',
};

export function TypeBadge({ type }: { type: TicketType }) {
  return <Badge tone={TYPE_TONE[type]}>{humanize(type)}</Badge>;
}

export function SlaIndicator({
  ticket,
}: {
  ticket: {
    statusCategory: StatusCategory;
    slaBreached: boolean;
    slaPausedAt?: string | null;
    resolutionDueAt?: string | null;
  };
}) {
  if (ticket.statusCategory === 'DONE') {
    return ticket.slaBreached ? <Badge tone="red">Breached</Badge> : <span className="text-xs text-slate-400">Met</span>;
  }
  if (ticket.slaBreached) {
    return (
      <Badge tone="red">
        <AlertTriangle className="size-3" /> Breached
      </Badge>
    );
  }
  if (ticket.slaPausedAt) {
    return (
      <Badge tone="slate">
        <PauseCircle className="size-3" /> Paused
      </Badge>
    );
  }
  if (!ticket.resolutionDueAt) return <span className="text-xs text-slate-400">—</span>;
  const left = new Date(ticket.resolutionDueAt).getTime() - Date.now();
  const tone: Tone = left < 0 ? 'red' : left < 3_600_000 ? 'amber' : 'green';
  return (
    <Badge tone={tone}>
      <Clock className="size-3" />
      {left < 0 ? `${formatDuration(left)} over` : `${formatDuration(left)} left`}
    </Badge>
  );
}

export function AssetStateBadge({ state }: { state: string }) {
  const tone: Tone = ['running', 'active', 'healthy'].includes(state)
    ? 'green'
    : ['stopped', 'empty', 'provisioning', 'unused'].includes(state)
      ? 'slate'
      : ['degraded', 'pending', 'stopping'].includes(state)
        ? 'amber'
        : ['deleted', 'terminated', 'failed', 'unhealthy'].includes(state)
          ? 'red'
          : 'slate';
  return <Badge tone={tone}>{state}</Badge>;
}

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  EC2_INSTANCE: 'EC2 Instance',
  LOAD_BALANCER: 'Load Balancer',
  TARGET_GROUP: 'Target Group',
  IAM_USER: 'IAM User',
};
