import { AwsAccount } from '@prisma/client';
import { emptyTrendMicro } from '../empty';
import type { ReportError, TrendComputer, TrendMicroReport, TrendThreat } from '../types';

const MODULES = ['antiMalware', 'intrusionPrevention', 'integrityMonitoring', 'firewall', 'webReputation', 'logInspection'] as const;

function summarize(computers: TrendComputer[], threats: TrendThreat[], errors: ReportError[]): TrendMicroReport {
  const modules = Object.fromEntries(
    MODULES.map((m) => {
      const on = computers.filter((c) => c.modules[m]).length;
      return [m, { on, off: computers.length - on }];
    }),
  ) as TrendMicroReport['modules'];
  const protectedCount = computers.filter((c) => c.status === 'online' && c.modules.antiMalware && c.threats === 0).length;
  return {
    source: 'live',
    errors,
    summary: {
      computers: computers.length,
      online: computers.filter((c) => c.status === 'online').length,
      offline: computers.filter((c) => c.status === 'offline').length,
      error: computers.filter((c) => c.status === 'error').length,
      protected: protectedCount,
      atRisk: computers.length - protectedCount,
      openThreats: threats.filter((t) => t.status === 'open').length,
    },
    modules,
    computers,
    threats: threats.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
  };
}

function on(module?: { state?: string } | boolean) {
  if (typeof module === 'boolean') return module;
  return (module?.state ?? '').toLowerCase() === 'on';
}

function mapComputer(raw: any, account: AwsAccount): TrendComputer {
  const host = raw.hostName ?? raw.hostname ?? raw.displayName ?? raw.name ?? 'unknown';
  const agent = raw.computerStatus ?? raw.status ?? {};
  const agentState = String(agent.agentStatus ?? agent.status ?? raw.status ?? 'online').toLowerCase();
  const status: TrendComputer['status'] = agentState.includes('offline') ? 'offline' : agentState.includes('error') ? 'error' : 'online';
  return {
    id: String(raw.ID ?? raw.id ?? host),
    name: raw.displayName ?? host,
    hostname: host,
    os: raw.platform ?? raw.os ?? 'Unknown',
    status,
    agentVersion: raw.agentVersion ?? raw.version ?? '—',
    lastSeenAt: raw.lastAgentCommunication ?? raw.lastSeenAt ?? new Date().toISOString(),
    group: raw.groupName ?? raw.group ?? 'Default',
    accountId: account.accountId,
    accountName: account.name,
    modules: {
      antiMalware: on(raw.antiMalware),
      intrusionPrevention: on(raw.intrusionPrevention),
      integrityMonitoring: on(raw.integrityMonitoring),
      firewall: on(raw.firewall),
      webReputation: on(raw.webReputation),
      logInspection: on(raw.logInspection),
    },
    threats: Number(raw.antiMalware?.detected ?? raw.threats ?? 0),
  };
}

export async function collectTrendMicro(accounts: AwsAccount[]): Promise<TrendMicroReport> {
  const url = process.env.TRENDMICRO_API_URL;
  const key = process.env.TRENDMICRO_API_KEY;
  if (!url || !key) {
    return emptyTrendMicro();
  }

  const computers: TrendComputer[] = [];
  const threats: TrendThreat[] = [];
  const errors: ReportError[] = [];
  const headers = { 'api-secret-key': key, 'api-version': 'v1', accept: 'application/json' };

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/computers`, { headers });
    if (!res.ok) throw new Error(`Trend Micro computers ${res.status}`);
    const body = (await res.json()) as { computers?: any[] };
    const account = accounts[0];
    computers.push(...(body.computers ?? []).map((c) => mapComputer(c, account ?? ({ accountId: '—', name: 'Trend Micro' } as AwsAccount))));

    const ev = await fetch(`${url.replace(/\/$/, '')}/antimalwareevents?maxItems=50`, { headers });
    if (ev.ok) {
      const data = (await ev.json()) as { antiMalwareEvents?: any[] };
      threats.push(
        ...(data.antiMalwareEvents ?? []).map((e, i) => ({
          id: String(e.uniqueID ?? e.ID ?? i),
          computer: e.hostName ?? e.computerName ?? 'unknown',
          type: e.malwareType ?? e.eventType ?? 'Malware',
          severity: (String(e.severity ?? 'medium').toLowerCase() as TrendThreat['severity']) || 'medium',
          detectedAt: e.eventTime ?? e.detectedAt ?? new Date().toISOString(),
          status: (e.scanAction1 || e.scanResult === 'quarantined' ? 'quarantined' : e.scanResult === 'deleted' ? 'cleaned' : 'open') as TrendThreat['status'],
          file: e.infectedFilePath ?? e.fileName,
        })),
      );
    }
  } catch (err) {
    errors.push({
      accountId: '—',
      accountName: 'Trend Micro',
      service: 'Trend Micro',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return summarize(computers, threats, errors);
}
