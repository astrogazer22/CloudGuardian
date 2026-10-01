import { Injectable } from '@nestjs/common';
import { AwsAccount } from '@prisma/client';
import { CollectedAsset, InventoryCollector } from './types';

const SERVICES = ['web', 'api', 'worker', 'auth', 'billing', 'search'];
const TYPES = ['t3.medium', 't3.large', 'm6i.large', 'm6i.xlarge', 'c6i.xlarge'];
const ENVS = ['prod', 'staging'];
const OWNERS: Record<string, string> = {
  web: 'platform-team',
  api: 'platform-team',
  worker: 'data-team',
  auth: 'security-team',
  billing: 'payments-team',
  search: 'data-team',
};

/** Deterministic pseudo-random generator so each account gets a stable fleet across syncs. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic inventory for demos and local development. The fleet is stable per account,
 * with a little per-sync randomness (instance state, target health) to exercise drift
 * detection and unhealthy-target auto-ticketing.
 */
@Injectable()
export class MockCollector implements InventoryCollector {
  async collect(account: AwsAccount): Promise<CollectedAsset[]> {
    const out: CollectedAsset[] = [];
    const live = Math.random;
    for (const region of account.regions) {
      const r = rng(account.accountId + region);
      for (const env of ENVS) {
        for (const svc of SERVICES.slice(0, env === 'prod' ? 6 : 3)) {
          const count = env === 'prod' ? 2 + Math.floor(r() * 2) : 1;
          const instances: CollectedAsset[] = [];
          for (let n = 1; n <= count; n++) {
            const id = `i-${Math.floor(r() * 0xffffffffff).toString(16).padStart(10, '0')}${n}`;
            const az = `${region}${'abc'[n % 3]}`;
            const stopped = env === 'staging' && live() < 0.2;
            instances.push({
              type: 'EC2_INSTANCE',
              arn: `arn:aws:ec2:${region}:${account.accountId}:instance/${id}`,
              resourceId: id,
              name: `${env}-${svc}-${n}`,
              region,
              state: stopped ? 'stopped' : 'running',
              tags: { Name: `${env}-${svc}-${n}`, Environment: env, Service: svc, Owner: OWNERS[svc] },
              relations: [],
              attributes: {
                instanceType: TYPES[Math.floor(r() * TYPES.length)],
                availabilityZone: az,
                privateIp: `10.${env === 'prod' ? 0 : 1}.${Math.floor(r() * 255)}.${Math.floor(r() * 254) + 1}`,
                vpcId: `vpc-${env}0001`,
                subnetId: `subnet-${az}`,
                imageId: 'ami-0c55b159cbfafe1f0',
                platform: 'Linux/UNIX',
                architecture: 'x86_64',
                launchTime: new Date(Date.now() - Math.floor(r() * 180) * 86_400_000).toISOString(),
                securityGroups: [{ id: `sg-${svc}01`, name: `${env}-${svc}-sg` }],
                monitoring: 'enabled',
              },
            });
          }
          out.push(...instances);

          if (!['web', 'api', 'auth', 'search'].includes(svc)) continue;
          const lbName = `${env}-${svc}-alb`;
          const tgName = `${env}-${svc}-tg`;
          const lbArn = `arn:aws:elasticloadbalancing:${region}:${account.accountId}:loadbalancer/app/${lbName}/${account.accountId.slice(-6)}`;
          const tgArn = `arn:aws:elasticloadbalancing:${region}:${account.accountId}:targetgroup/${tgName}/${account.accountId.slice(-6)}`;
          const targets = instances.map((i) => {
            const state = i.state !== 'running' ? 'unused' : live() < 0.04 ? 'unhealthy' : 'healthy';
            return {
              id: i.resourceId,
              port: 8080,
              state,
              reason: state === 'unhealthy' ? 'Target.ResponseCodeMismatch' : undefined,
            };
          });
          const unhealthy = targets.filter((t) => t.state === 'unhealthy').length;
          out.push({
            type: 'LOAD_BALANCER',
            arn: lbArn,
            resourceId: lbName,
            name: lbName,
            region,
            state: 'active',
            tags: { Environment: env, Service: svc, Owner: OWNERS[svc] },
            relations: [{ toArn: tgArn, type: 'ROUTES_TO' }],
            attributes: {
              lbType: 'application',
              scheme: svc === 'web' ? 'internet-facing' : 'internal',
              dnsName: `${lbName}-${account.accountId.slice(-4)}.${region}.elb.amazonaws.com`,
              vpcId: `vpc-${env}0001`,
              ipAddressType: 'ipv4',
              availabilityZones: [`${region}a`, `${region}b`, `${region}c`],
              listeners: [
                { port: 443, protocol: 'HTTPS', defaultAction: 'forward' },
                { port: 80, protocol: 'HTTP', defaultAction: 'redirect' },
              ],
            },
          });
          out.push({
            type: 'TARGET_GROUP',
            arn: tgArn,
            resourceId: tgName,
            name: tgName,
            region,
            state: unhealthy ? 'degraded' : 'healthy',
            tags: { Environment: env, Service: svc, Owner: OWNERS[svc] },
            relations: instances.map((i) => ({ toArn: i.arn, type: 'TARGETS' as const })),
            attributes: {
              protocol: 'HTTP',
              port: 8080,
              targetType: 'instance',
              vpcId: `vpc-${env}0001`,
              healthCheck: { path: '/healthz', protocol: 'HTTP', port: 'traffic-port' },
              targets,
              healthyCount: targets.filter((t) => t.state === 'healthy').length,
              unhealthyCount: unhealthy,
            },
          });
        }
      }
    }
    return out;
  }
}
