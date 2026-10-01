import {
  BackupClient,
  BackupJob,
  BackupVaultListMember,
  ListBackupJobsCommand,
  ListBackupVaultsCommand,
  ListProtectedResourcesCommand,
  ProtectedResource,
} from '@aws-sdk/client-backup';
import { AwsAccount } from '@prisma/client';
import { credentialsForAccount } from '../../aws/credentials';
import { emptyBackup } from '../empty';
import type { BackupJob as Job, BackupReport, BackupVault, ReportError } from '../types';

const since24h = () => new Date(Date.now() - 86_400_000);

function resourceName(arn?: string) {
  if (!arn) return 'unknown';
  const last = arn.split('/').pop() ?? arn;
  return last.split(':').pop() ?? last;
}

function mapJob(j: BackupJob, account: AwsAccount, region: string): Job {
  return {
    id: j.BackupJobId ?? 'unknown',
    resourceArn: j.ResourceArn ?? '',
    resourceName: resourceName(j.ResourceArn),
    resourceType: j.ResourceType ?? 'UNKNOWN',
    status: j.State ?? 'UNKNOWN',
    startedAt: (j.CreationDate ?? new Date()).toISOString(),
    completedAt: j.CompletionDate?.toISOString() ?? null,
    bytes: j.BackupSizeInBytes ?? null,
    accountId: account.accountId,
    accountName: account.name,
    region,
  };
}

function mapVault(v: BackupVaultListMember, account: AwsAccount, region: string): BackupVault {
  return {
    name: v.BackupVaultName ?? 'unnamed',
    accountId: account.accountId,
    accountName: account.name,
    region,
    recoveryPoints: v.NumberOfRecoveryPoints ?? 0,
    encrypted: !!v.EncryptionKeyArn,
    lastBackupAt: v.CreationDate?.toISOString() ?? null,
  };
}

function summarize(
  jobs: Job[],
  vaults: BackupVault[],
  protectedResources: BackupReport['protectedResources'],
  errors: ReportError[],
): BackupReport {
  const jobs24h = jobs.filter((j) => Date.now() - new Date(j.startedAt).getTime() < 86_400_000);
  const ok = (s: string) => ['COMPLETED', 'COMPLETED_WITH_ISSUES'].includes(s);
  const fail = (s: string) => ['FAILED', 'ABORTED', 'EXPIRED'].includes(s);
  return {
    source: 'live',
    errors,
    summary: {
      vaults: vaults.length,
      protectedResources: protectedResources.length,
      recoveryPoints: vaults.reduce((s, v) => s + v.recoveryPoints, 0),
      jobs24h: jobs24h.length,
      succeeded: jobs24h.filter((j) => ok(j.status)).length,
      failed: jobs24h.filter((j) => fail(j.status)).length,
      running: jobs.filter((j) => ['CREATED', 'PENDING', 'RUNNING'].includes(j.status)).length,
      bytes24h: jobs24h.reduce((s, j) => s + (j.bytes ?? 0), 0),
    },
    vaults,
    jobs: jobs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    protectedResources,
  };
}

export async function collectBackup(accounts: AwsAccount[]): Promise<BackupReport> {
  if (!accounts.length) return emptyBackup();
  const jobs: Job[] = [];
  const vaults: BackupVault[] = [];
  const protectedResources: BackupReport['protectedResources'] = [];
  const errors: ReportError[] = [];

  for (const account of accounts) {
    try {
      const credentials = await credentialsForAccount(account);
      for (const region of account.regions.length ? account.regions : ['us-east-1']) {
        const client = new BackupClient({ region, credentials });
        let vaultToken: string | undefined;
        do {
          const page = await client.send(new ListBackupVaultsCommand({ MaxResults: 100, NextToken: vaultToken }));
          for (const v of page.BackupVaultList ?? []) vaults.push(mapVault(v, account, region));
          vaultToken = page.NextToken;
        } while (vaultToken);

        let jobToken: string | undefined;
        do {
          const page = await client.send(
            new ListBackupJobsCommand({ MaxResults: 100, NextToken: jobToken, ByCreatedAfter: since24h() }),
          );
          for (const j of page.BackupJobs ?? []) jobs.push(mapJob(j, account, region));
          jobToken = page.NextToken;
        } while (jobToken);

        let resourceToken: string | undefined;
        do {
          const page = await client.send(new ListProtectedResourcesCommand({ MaxResults: 100, NextToken: resourceToken }));
          for (const p of page.Results ?? []) {
            const pr = p as ProtectedResource;
            protectedResources.push({
              arn: pr.ResourceArn ?? '',
              name: resourceName(pr.ResourceArn),
              type: pr.ResourceType ?? 'UNKNOWN',
              lastBackupAt: pr.LastBackupTime?.toISOString() ?? null,
              accountId: account.accountId,
              accountName: account.name,
              region,
            });
          }
          resourceToken = page.NextToken;
        } while (resourceToken);
      }
    } catch (err) {
      errors.push({
        accountId: account.accountId,
        accountName: account.name,
        service: 'Backup',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summarize(jobs, vaults, protectedResources, errors);
}
