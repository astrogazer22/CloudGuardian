import { Inspector2Client, ListFindingsCommand, type Finding } from '@aws-sdk/client-inspector2';
import { AwsAccount } from '@prisma/client';
import { credentialsForAccount } from '../../aws/credentials';
import { emptyInspector } from '../empty';
import type { InspectorFinding, InspectorReport, ReportError } from '../types';

function severity(s?: string): InspectorFinding['severity'] {
  const u = (s ?? 'UNTRIAGED').toUpperCase();
  if (u === 'CRITICAL' || u === 'HIGH' || u === 'MEDIUM' || u === 'LOW' || u === 'INFORMATIONAL' || u === 'UNTRIAGED') return u;
  return 'UNTRIAGED';
}

function mapFinding(f: Finding, account: AwsAccount, region: string): InspectorFinding {
  const resource = f.resources?.[0];
  const vuln = f.packageVulnerabilityDetails;
  return {
    id: f.findingArn ?? `${account.accountId}-${f.title}`,
    title: f.title ?? 'Untitled finding',
    severity: severity(f.severity),
    status: (f.status as InspectorFinding['status']) ?? 'ACTIVE',
    type: f.type ?? 'UNKNOWN',
    resource: resource?.id ?? 'unknown',
    resourceType: resource?.type ?? 'UNKNOWN',
    cve: vuln?.vulnerabilityId ?? null,
    score: f.inspectorScore ?? vuln?.cvss?.[0]?.baseScore ?? null,
    firstSeenAt: (f.firstObservedAt ?? new Date()).toISOString(),
    lastSeenAt: (f.lastObservedAt ?? new Date()).toISOString(),
    accountId: account.accountId,
    accountName: account.name,
    region,
    description: f.description,
  };
}

function summarize(findings: InspectorFinding[], errors: ReportError[]): InspectorReport {
  const active = findings.filter((f) => f.status === 'ACTIVE');
  const countSev = (s: InspectorFinding['severity']) => active.filter((f) => f.severity === s).length;
  const typeMap = new Map<string, number>();
  for (const f of active) typeMap.set(f.type, (typeMap.get(f.type) ?? 0) + 1);
  const rank: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFORMATIONAL: 1, UNTRIAGED: 0 };
  return {
    source: 'live',
    errors,
    summary: {
      findings: active.length,
      critical: countSev('CRITICAL'),
      high: countSev('HIGH'),
      medium: countSev('MEDIUM'),
      low: countSev('LOW'),
      informational: countSev('INFORMATIONAL'),
      resourcesScanned: new Set(findings.map((f) => f.resource)).size,
    },
    byType: [...typeMap.entries()].map(([key, count]) => ({ key, label: key.replace(/_/g, ' '), count })),
    findings: findings.sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0) || b.lastSeenAt.localeCompare(a.lastSeenAt)),
  };
}

export async function collectInspector(accounts: AwsAccount[]): Promise<InspectorReport> {
  if (!accounts.length) return emptyInspector();
  const findings: InspectorFinding[] = [];
  const errors: ReportError[] = [];

  for (const account of accounts) {
    try {
      const credentials = await credentialsForAccount(account);
      for (const region of account.regions.length ? account.regions : ['us-east-1']) {
        const client = new Inspector2Client({ region, credentials });
        let next: string | undefined;
        let pages = 0;
        do {
          const page = await client.send(
            new ListFindingsCommand({
              maxResults: 100,
              nextToken: next,
              filterCriteria: { findingStatus: [{ comparison: 'EQUALS', value: 'ACTIVE' }] },
            }),
          );
          for (const f of page.findings ?? []) findings.push(mapFinding(f, account, region));
          next = page.nextToken;
          pages++;
        } while (next && pages < 5);
      }
    } catch (err) {
      errors.push({
        accountId: account.accountId,
        accountName: account.name,
        service: 'Inspector',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summarize(findings, errors);
}
