import { CloudWatchClient, DescribeAlarmsCommand, MetricAlarm } from '@aws-sdk/client-cloudwatch';
import { AwsAccount } from '@prisma/client';
import { credentialsForAccount } from '../../aws/credentials';
import { emptyCloudWatch } from '../empty';
import type { CloudWatchAlarm, CloudWatchReport, ReportError } from '../types';

function toState(s?: string): CloudWatchAlarm['state'] {
  if (s === 'ALARM') return 'ALARM';
  if (s === 'INSUFFICIENT_DATA') return 'INSUFFICIENT_DATA';
  return 'OK';
}

function toAlarm(a: MetricAlarm, account: AwsAccount): CloudWatchAlarm {
  return {
    name: a.AlarmName ?? 'unnamed',
    state: toState(a.StateValue),
    namespace: a.Namespace ?? 'Custom',
    metric: a.MetricName ?? a.Metrics?.[0]?.Id ?? 'composite',
    statistic: a.Statistic ?? a.ExtendedStatistic,
    threshold: a.Threshold !== undefined ? `${a.ComparisonOperator ?? ''} ${a.Threshold}`.trim() : undefined,
    accountId: account.accountId,
    accountName: account.name,
    region: a.AlarmArn?.split(':')[3] ?? account.regions[0] ?? 'us-east-1',
    reason: a.StateReason,
    updatedAt: (a.StateUpdatedTimestamp ?? a.AlarmConfigurationUpdatedTimestamp ?? new Date()).toISOString(),
    actionsEnabled: a.ActionsEnabled ?? false,
  };
}

function summarize(alarms: CloudWatchAlarm[], errors: ReportError[]): CloudWatchReport {
  const totals = { OK: 0, ALARM: 0, INSUFFICIENT_DATA: 0, total: alarms.length };
  const nsMap = new Map<string, number>();
  const acctMap = new Map<string, { accountId: string; accountName: string; OK: number; ALARM: number; INSUFFICIENT_DATA: number }>();
  for (const a of alarms) {
    totals[a.state]++;
    nsMap.set(a.namespace, (nsMap.get(a.namespace) ?? 0) + 1);
    const row = acctMap.get(a.accountId) ?? { accountId: a.accountId, accountName: a.accountName, OK: 0, ALARM: 0, INSUFFICIENT_DATA: 0 };
    row[a.state]++;
    acctMap.set(a.accountId, row);
  }
  return {
    source: 'live',
    errors,
    totals,
    byNamespace: [...nsMap.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count),
    byAccount: [...acctMap.values()],
    alarms: alarms.sort((a, b) => Number(a.state === 'OK') - Number(b.state === 'OK') || b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export async function collectCloudWatch(accounts: AwsAccount[]): Promise<CloudWatchReport> {
  if (!accounts.length) return emptyCloudWatch();
  const alarms: CloudWatchAlarm[] = [];
  const errors: ReportError[] = [];

  for (const account of accounts) {
    try {
      const credentials = await credentialsForAccount(account);
      for (const region of account.regions.length ? account.regions : ['us-east-1']) {
        const cw = new CloudWatchClient({ region, credentials });
        let next: string | undefined;
        do {
          const page = await cw.send(new DescribeAlarmsCommand({ MaxRecords: 100, NextToken: next }));
          for (const a of page.MetricAlarms ?? []) alarms.push(toAlarm(a, account));
          next = page.NextToken;
        } while (next);
      }
    } catch (err) {
      errors.push({
        accountId: account.accountId,
        accountName: account.name,
        service: 'CloudWatch',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summarize(alarms, errors);
}
