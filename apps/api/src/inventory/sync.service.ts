import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Asset, AwsAccount, Prisma } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AccessService } from '../auth/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { AwsCollector } from './collectors/aws.collector';
import { MockCollector } from './collectors/mock.collector';
import { CollectedAsset } from './collectors/types';

const QUEUE = 'aws-inventory-sync';
const AUTO_TICKET_TAG = 'auto:unhealthy-targets';

@Injectable()
export class SyncService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SyncService.name);
  private queue: Queue;
  private worker?: Worker;
  private connections: IORedis[] = [];

  constructor(
    private prisma: PrismaService,
    private aws: AwsCollector,
    private mock: MockCollector,
    private tickets: TicketsService,
    private access: AccessService,
  ) {}

  onModuleInit() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const conn = () => {
      const c = new IORedis(url, { maxRetriesPerRequest: null });
      this.connections.push(c);
      return c;
    };
    this.queue = new Queue(QUEUE, { connection: conn() });
    if (process.env.RUN_WORKERS !== 'false') {
      this.worker = new Worker(QUEUE, (job) => this.runSync(job.data.syncRunId), { connection: conn(), concurrency: 2 });
      this.worker.on('failed', (job, err) => this.logger.error(`Sync job ${job?.id} failed: ${err.message}`));
    }
  }

  async onApplicationBootstrap() {
    if (process.env.RUN_WORKERS === 'false') return;
    const neverSynced = await this.prisma.awsAccount.findMany({
      where: { enabled: true, lastSyncAt: null, syncRuns: { none: { status: { in: ['QUEUED', 'RUNNING'] } } } },
    });
    for (const a of neverSynced) await this.enqueue(a.id);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connections.forEach((c) => c.disconnect());
  }

  async enqueue(awsAccountId: string) {
    const run = await this.prisma.syncRun.create({ data: { awsAccountId, status: 'QUEUED' } });
    await this.prisma.awsAccount.update({ where: { id: awsAccountId }, data: { lastSyncStatus: 'QUEUED' } });
    await this.queue.add('sync', { syncRunId: run.id }, { removeOnComplete: 200, removeOnFail: 200 });
    return run;
  }

  @Cron(process.env.AWS_SYNC_CRON ?? '0 */6 * * *')
  async scheduledSync() {
    if (process.env.RUN_WORKERS === 'false') return;
    const accounts = await this.prisma.awsAccount.findMany({ where: { enabled: true } });
    for (const a of accounts) await this.enqueue(a.id);
    this.logger.log(`Scheduled inventory sync for ${accounts.length} account(s)`);
  }

  async runSync(syncRunId: string) {
    const run = await this.prisma.syncRun.update({
      where: { id: syncRunId },
      data: { status: 'RUNNING', startedAt: new Date() },
      include: { awsAccount: true },
    });
    const account = run.awsAccount;
    await this.prisma.awsAccount.update({ where: { id: account.id }, data: { lastSyncStatus: 'RUNNING' } });

    try {
      if (account.mock && process.env.ALLOW_DEMO_AWS !== 'true') {
        throw new Error('Demo inventory is disabled. Connect a live AWS account under AWS Accounts.');
      }
      const collected = await (account.mock ? this.mock : this.aws).collect(account);
      const { stats, arnToId } = await this.reconcile(account, collected);
      const finishedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.syncRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED', finishedAt, stats } }),
        this.prisma.awsAccount.update({
          where: { id: account.id },
          data: { lastSyncAt: finishedAt, lastSyncStatus: 'SUCCEEDED' },
        }),
      ]);
      this.logger.log(`Synced ${account.name} (${account.accountId}): ${JSON.stringify(stats)}`);
      if (process.env.AUTO_TICKETS !== 'false') await this.raiseUnhealthyTargetTickets(collected, arnToId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.$transaction([
        this.prisma.syncRun.update({
          where: { id: run.id },
          data: { status: 'FAILED', finishedAt: new Date(), error: message },
        }),
        this.prisma.awsAccount.update({ where: { id: account.id }, data: { lastSyncStatus: 'FAILED' } }),
      ]);
      this.logger.error(`Sync failed for ${account.accountId}: ${message}`);
    }
  }

  /** Upserts collected assets, records drift, rebuilds relations and soft-deletes assets no longer present. */
  private async reconcile(account: AwsAccount, collected: CollectedAsset[]) {
    const now = new Date();
    const stats = { discovered: collected.length, created: 0, modified: 0, removed: 0, byType: {} as Record<string, number> };
    const arnToId = new Map<string, string>();

    for (const a of collected) {
      stats.byType[a.type] = (stats.byType[a.type] ?? 0) + 1;
      const tags = a.tags;
      const data = {
        type: a.type,
        resourceId: a.resourceId,
        name: a.name,
        region: a.region,
        state: a.state,
        attributes: a.attributes as Prisma.InputJsonValue,
        tags: tags as Prisma.InputJsonValue,
        owner: tags.Owner ?? tags.owner ?? tags.Team ?? tags.team ?? null,
        environment: tags.Environment ?? tags.environment ?? tags.Env ?? tags.env ?? null,
        lastSeenAt: now,
        deletedAt: null,
      };
      const existing = await this.prisma.asset.findUnique({ where: { arn: a.arn } });
      if (!existing) {
        const created = await this.prisma.asset.create({
          data: { ...data, arn: a.arn, awsAccountId: account.id, changes: { create: { kind: 'discovered', changes: [] } } },
        });
        arnToId.set(a.arn, created.id);
        stats.created++;
        continue;
      }
      const diff = diffAsset(existing, a);
      await this.prisma.asset.update({
        where: { id: existing.id },
        data: {
          ...data,
          changes: diff.length
            ? { create: { kind: existing.deletedAt ? 'restored' : 'modified', changes: diff as Prisma.InputJsonValue } }
            : undefined,
        },
      });
      arnToId.set(a.arn, existing.id);
      if (diff.length) stats.modified++;
    }

    const ids = [...arnToId.values()];
    const relations = collected.flatMap((a) =>
      a.relations
        .map((r) => ({ fromId: arnToId.get(a.arn)!, toId: arnToId.get(r.toArn), type: r.type }))
        .filter((r): r is { fromId: string; toId: string; type: 'ROUTES_TO' | 'TARGETS' } => !!r.toId),
    );
    await this.prisma.$transaction([
      this.prisma.assetRelation.deleteMany({ where: { fromId: { in: ids } } }),
      this.prisma.assetRelation.createMany({ data: relations, skipDuplicates: true }),
    ]);

    const gone = await this.prisma.asset.findMany({
      where: { awsAccountId: account.id, deletedAt: null, id: { notIn: ids } },
      select: { id: true, state: true },
    });
    for (const g of gone) {
      await this.prisma.asset.update({
        where: { id: g.id },
        data: {
          deletedAt: now,
          state: 'deleted',
          changes: { create: { kind: 'removed', changes: [{ field: 'state', from: g.state, to: 'deleted' }] } },
        },
      });
    }
    stats.removed = gone.length;
    return { stats, arnToId };
  }

  private async raiseUnhealthyTargetTickets(collected: CollectedAsset[], arnToId: Map<string, string>) {
    const degraded = collected.filter((a) => a.type === 'TARGET_GROUP' && Number(a.attributes.unhealthyCount) > 0);
    if (!degraded.length) return;
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, orderBy: { createdAt: 'asc' } });
    const actor = admin && (await this.access.load(admin.id));
    if (!actor) return;

    for (const tg of degraded) {
      const tgId = arnToId.get(tg.arn)!;
      const open = await this.prisma.ticket.findFirst({
        where: { statusCategory: { not: 'DONE' }, tags: { has: AUTO_TICKET_TAG }, assets: { some: { assetId: tgId } } },
      });
      if (open) continue;

      const targets = (tg.attributes.targets as { id: string; state: string; reason?: string }[]) ?? [];
      const bad = targets.filter((t) => t.state === 'unhealthy');
      const lb = collected.find((a) => a.type === 'LOAD_BALANCER' && a.relations.some((r) => r.toArn === tg.arn));
      const instanceIds = bad
        .map((t) => collected.find((a) => a.type === 'EC2_INSTANCE' && a.resourceId === t.id))
        .map((a) => a && arnToId.get(a.arn))
        .filter((id): id is string => !!id);
      const env = tg.tags.Environment ?? tg.tags.environment;

      await this.tickets.create(
        actor,
        {
          title: `Unhealthy targets in ${tg.name} (${tg.region})`,
          description:
            `${bad.length} of ${targets.length} targets in target group **${tg.name}** are failing health checks` +
            (lb ? ` behind load balancer **${lb.name}**` : '') +
            `.\n\n` +
            bad.map((t) => `- ${t.id}: ${t.reason ?? 'unhealthy'}`).join('\n') +
            `\n\nAuto-created by CloudGuardian inventory sync.`,
          type: 'INCIDENT',
          priority: env === 'prod' ? 'P2' : 'P3',
          category: 'Infrastructure',
          tags: [AUTO_TICKET_TAG, 'aws', ...(env ? [env] : [])],
          assetIds: [tgId, ...(lb ? [arnToId.get(lb.arn)!] : []), ...instanceIds],
        },
      );
      this.logger.warn(`Opened incident for unhealthy targets in ${tg.name}`);
    }
  }
}

function diffAsset(existing: Asset, next: CollectedAsset) {
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  const cmp = (field: string, a: unknown, b: unknown) => {
    if (stableStringify(a) !== stableStringify(b)) changes.push({ field, from: a ?? null, to: b ?? null });
  };
  cmp('name', existing.name, next.name);
  cmp('state', existing.state, next.state);
  cmp('tags', existing.tags, next.tags);
  const prevAttrs = (existing.attributes ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(prevAttrs), ...Object.keys(next.attributes)])) {
    cmp(`attributes.${key}`, prevAttrs[key], next.attributes[key]);
  }
  return changes;
}

/** JSONB does not preserve key order, so compare with keys sorted and undefined treated as null. */
function stableStringify(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined && val !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${stableStringify(val)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
