import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AssumeRoleCommand } from '@aws-sdk/client-sts';
import { AwsAccount } from '@prisma/client';

export type AwsCreds = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

export interface AwsIdentity {
  accountId: string;
  arn: string;
  userId: string;
}

export function storedCreds(account: Pick<AwsAccount, 'accessKeyId' | 'secretAccessKey' | 'sessionToken'>): AwsCreds | undefined {
  if (!account.accessKeyId || !account.secretAccessKey) return undefined;
  return {
    accessKeyId: account.accessKeyId,
    secretAccessKey: account.secretAccessKey,
    sessionToken: account.sessionToken ?? undefined,
  };
}

/** Role credentials, stored keys, or undefined so the AWS SDK uses the default chain. */
export async function credentialsForAccount(account: AwsAccount): Promise<AwsCreds | undefined> {
  const stored = storedCreds(account);
  if (stored) return stored;
  if (!account.roleArn) return undefined;
  const sts = new STSClient({ region: process.env.AWS_STS_REGION ?? account.regions[0] ?? 'us-east-1' });
  const { Credentials: c } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: account.roleArn,
      RoleSessionName: 'cloudguardian',
      ExternalId: account.externalId,
      DurationSeconds: 3600,
    }),
  );
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) throw new Error('AssumeRole returned no credentials');
  return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken };
}

export async function callerIdentity(credentials?: AwsCreds, region?: string): Promise<AwsIdentity> {
  const sts = new STSClient({ region: region ?? process.env.AWS_STS_REGION ?? process.env.AWS_REGION ?? 'us-east-1', credentials });
  const id = await sts.send(new GetCallerIdentityCommand({}));
  if (!id.Account || !id.Arn || !id.UserId) throw new Error('STS GetCallerIdentity returned an incomplete identity');
  return { accountId: id.Account, arn: id.Arn, userId: id.UserId };
}

export function authMode(account: Pick<AwsAccount, 'roleArn' | 'accessKeyId' | 'secretAccessKey' | 'mock'>): 'demo' | 'keys' | 'role' | 'default' {
  if (account.mock && process.env.ALLOW_DEMO_AWS === 'true') return 'demo';
  if (account.accessKeyId && account.secretAccessKey) return 'keys';
  if (account.roleArn) return 'role';
  return 'default';
}

export function toPublicAccount<T extends AwsAccount>(account: T) {
  const { secretAccessKey: _secret, sessionToken: _token, accessKeyId, ...rest } = account;
  return {
    ...rest,
    accessKeyId: accessKeyId ? `${accessKeyId.slice(0, 4)}…${accessKeyId.slice(-4)}` : null,
    hasSecret: Boolean(_secret),
    authMode: authMode(account),
  };
}
