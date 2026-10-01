import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { AwsAccount } from '@prisma/client';

export type AwsCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken: string };

export async function assumeAccountRole(account: AwsAccount): Promise<AwsCredentials | undefined> {
  if (!account.roleArn) return undefined;
  const sts = new STSClient({ region: process.env.AWS_STS_REGION ?? 'us-east-1' });
  const { Credentials: c } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: account.roleArn,
      RoleSessionName: 'cloudguardian-reports',
      ExternalId: account.externalId,
      DurationSeconds: 3600,
    }),
  );
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) throw new Error('AssumeRole returned no credentials');
  return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken };
}
