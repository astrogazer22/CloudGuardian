import { EC2Client, Instance, paginateDescribeInstances, Tag } from '@aws-sdk/client-ec2';
import {
  DescribeListenersCommand,
  DescribeTagsCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client,
  LoadBalancer,
  paginateDescribeLoadBalancers,
  paginateDescribeTargetGroups,
  TargetGroup,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  GetLoginProfileCommand,
  IAMClient,
  ListAccessKeysCommand,
  ListGroupsForUserCommand,
  ListMFADevicesCommand,
  ListUserTagsCommand,
  paginateListUsers,
  User,
} from '@aws-sdk/client-iam';
import { Injectable } from '@nestjs/common';
import { AwsAccount } from '@prisma/client';
import { AwsCreds, credentialsForAccount } from '../../aws/credentials';
import { CollectedAsset, InventoryCollector } from './types';

type Credentials = AwsCreds;

const tagMap = (tags?: { Key?: string; Value?: string }[]) =>
  Object.fromEntries((tags ?? []).filter((t) => t.Key).map((t) => [t.Key!, t.Value ?? '']));

/**
 * Read-only inventory from the live AWS account: EC2, ELBv2, and IAM users.
 * Credentials: stored access keys, AssumeRole + external ID, or the default AWS chain.
 */
@Injectable()
export class AwsCollector implements InventoryCollector {
  async collect(account: AwsAccount): Promise<CollectedAsset[]> {
    const credentials = await credentialsForAccount(account);
    const results: CollectedAsset[] = [];
    for (const region of account.regions.length ? account.regions : ['us-east-1']) {
      results.push(...(await this.collectEc2(account, region, credentials)));
      results.push(...(await this.collectElb(region, credentials)));
    }
    results.push(...(await this.collectIam(account, credentials)));
    return results;
  }

  private async collectEc2(account: AwsAccount, region: string, credentials?: Credentials) {
    const ec2 = new EC2Client({ region, credentials });
    const out: CollectedAsset[] = [];
    for await (const page of paginateDescribeInstances({ client: ec2 }, {})) {
      for (const r of page.Reservations ?? []) {
        for (const i of r.Instances ?? []) out.push(this.toInstance(i, account, region));
      }
    }
    return out;
  }

  private toInstance(i: Instance, account: AwsAccount, region: string): CollectedAsset {
    const tags = tagMap(i.Tags as Tag[]);
    return {
      type: 'EC2_INSTANCE',
      arn: `arn:aws:ec2:${region}:${account.accountId}:instance/${i.InstanceId}`,
      resourceId: i.InstanceId!,
      name: tags.Name || i.InstanceId!,
      region,
      state: i.State?.Name ?? 'unknown',
      tags,
      relations: [],
      attributes: {
        instanceType: i.InstanceType,
        availabilityZone: i.Placement?.AvailabilityZone,
        privateIp: i.PrivateIpAddress,
        publicIp: i.PublicIpAddress,
        privateDns: i.PrivateDnsName,
        vpcId: i.VpcId,
        subnetId: i.SubnetId,
        imageId: i.ImageId,
        platform: i.PlatformDetails,
        architecture: i.Architecture,
        launchTime: i.LaunchTime?.toISOString(),
        iamInstanceProfile: i.IamInstanceProfile?.Arn,
        securityGroups: i.SecurityGroups?.map((g) => ({ id: g.GroupId, name: g.GroupName })),
        volumes: i.BlockDeviceMappings?.map((b) => ({ device: b.DeviceName, volumeId: b.Ebs?.VolumeId })),
        monitoring: i.Monitoring?.State,
      },
    };
  }

  private async collectElb(region: string, credentials?: Credentials) {
    const elb = new ElasticLoadBalancingV2Client({ region, credentials });
    const lbs: LoadBalancer[] = [];
    for await (const page of paginateDescribeLoadBalancers({ client: elb }, {})) lbs.push(...(page.LoadBalancers ?? []));
    const tgs: TargetGroup[] = [];
    for await (const page of paginateDescribeTargetGroups({ client: elb }, {})) tgs.push(...(page.TargetGroups ?? []));

    const tags = await this.fetchTags(elb, [...lbs.map((l) => l.LoadBalancerArn!), ...tgs.map((t) => t.TargetGroupArn!)]);
    const out: CollectedAsset[] = [];

    for (const lb of lbs) {
      const listeners = await elb.send(new DescribeListenersCommand({ LoadBalancerArn: lb.LoadBalancerArn }));
      const lbTgs = tgs.filter((tg) => tg.LoadBalancerArns?.includes(lb.LoadBalancerArn!));
      out.push({
        type: 'LOAD_BALANCER',
        arn: lb.LoadBalancerArn!,
        resourceId: lb.LoadBalancerName!,
        name: lb.LoadBalancerName!,
        region,
        state: lb.State?.Code ?? 'unknown',
        tags: tags[lb.LoadBalancerArn!] ?? {},
        relations: lbTgs.map((tg) => ({ toArn: tg.TargetGroupArn!, type: 'ROUTES_TO' as const })),
        attributes: {
          lbType: lb.Type,
          scheme: lb.Scheme,
          dnsName: lb.DNSName,
          vpcId: lb.VpcId,
          ipAddressType: lb.IpAddressType,
          availabilityZones: lb.AvailabilityZones?.map((z) => z.ZoneName),
          securityGroups: lb.SecurityGroups,
          createdTime: lb.CreatedTime?.toISOString(),
          listeners: listeners.Listeners?.map((l) => ({
            port: l.Port,
            protocol: l.Protocol,
            certificates: l.Certificates?.map((c) => c.CertificateArn),
            defaultAction: l.DefaultActions?.[0]?.Type,
          })),
        },
      });
    }

    for (const tg of tgs) {
      const health = await elb.send(new DescribeTargetHealthCommand({ TargetGroupArn: tg.TargetGroupArn }));
      const targets = (health.TargetHealthDescriptions ?? []).map((d) => ({
        id: d.Target?.Id,
        port: d.Target?.Port,
        state: d.TargetHealth?.State,
        reason: d.TargetHealth?.Reason,
      }));
      const unhealthy = targets.filter((t) => t.state === 'unhealthy').length;
      const accountId = tg.TargetGroupArn!.split(':')[4];
      out.push({
        type: 'TARGET_GROUP',
        arn: tg.TargetGroupArn!,
        resourceId: tg.TargetGroupName!,
        name: tg.TargetGroupName!,
        region,
        state: !targets.length ? 'empty' : unhealthy ? 'degraded' : 'healthy',
        tags: tags[tg.TargetGroupArn!] ?? {},
        relations:
          tg.TargetType === 'instance'
            ? targets
                .filter((t) => t.id)
                .map((t) => ({ toArn: `arn:aws:ec2:${region}:${accountId}:instance/${t.id}`, type: 'TARGETS' as const }))
            : [],
        attributes: {
          protocol: tg.Protocol,
          port: tg.Port,
          targetType: tg.TargetType,
          vpcId: tg.VpcId,
          healthCheck: { path: tg.HealthCheckPath, protocol: tg.HealthCheckProtocol, port: tg.HealthCheckPort },
          targets,
          healthyCount: targets.filter((t) => t.state === 'healthy').length,
          unhealthyCount: unhealthy,
        },
      });
    }
    return out;
  }

  private async fetchTags(elb: ElasticLoadBalancingV2Client, arns: string[]) {
    const result: Record<string, Record<string, string>> = {};
    for (let i = 0; i < arns.length; i += 20) {
      const res = await elb.send(new DescribeTagsCommand({ ResourceArns: arns.slice(i, i + 20) }));
      for (const d of res.TagDescriptions ?? []) result[d.ResourceArn!] = tagMap(d.Tags);
    }
    return result;
  }

  private async collectIam(account: AwsAccount, credentials?: Credentials) {
    const iam = new IAMClient({ region: 'us-east-1', credentials });
    const out: CollectedAsset[] = [];
    for await (const page of paginateListUsers({ client: iam }, {})) {
      for (const user of page.Users ?? []) out.push(await this.toIamUser(iam, user, account));
    }
    return out;
  }

  private async toIamUser(iam: IAMClient, user: User, account: AwsAccount): Promise<CollectedAsset> {
    const name = user.UserName!;
    const [keys, mfa, groups, tags, consoleAccess] = await Promise.all([
      iam.send(new ListAccessKeysCommand({ UserName: name })).catch(() => ({ AccessKeyMetadata: [] })),
      iam.send(new ListMFADevicesCommand({ UserName: name })).catch(() => ({ MFADevices: [] })),
      iam.send(new ListGroupsForUserCommand({ UserName: name })).catch(() => ({ Groups: [] })),
      iam.send(new ListUserTagsCommand({ UserName: name })).catch(() => ({ Tags: [] })),
      iam
        .send(new GetLoginProfileCommand({ UserName: name }))
        .then((p) => ({ enabled: true, created: p.LoginProfile?.CreateDate?.toISOString() }))
        .catch(() => ({ enabled: false, created: undefined })),
    ]);
    const tagObj = tagMap(tags.Tags);
    return {
      type: 'IAM_USER',
      arn: user.Arn!,
      resourceId: user.UserId ?? name,
      name,
      region: 'global',
      state: user.PasswordLastUsed || consoleAccess.enabled ? 'active' : 'unused',
      tags: tagObj,
      relations: [],
      attributes: {
        userId: user.UserId,
        path: user.Path,
        createdAt: user.CreateDate?.toISOString(),
        passwordLastUsed: user.PasswordLastUsed?.toISOString() ?? null,
        consoleAccess: consoleAccess.enabled,
        mfaEnabled: (mfa.MFADevices?.length ?? 0) > 0,
        mfaDevices: mfa.MFADevices?.map((d) => d.SerialNumber),
        groups: groups.Groups?.map((g) => g.GroupName),
        accessKeys: keys.AccessKeyMetadata?.map((k) => ({
          id: k.AccessKeyId,
          status: k.Status,
          created: k.CreateDate?.toISOString(),
        })),
      },
    };
  }
}
