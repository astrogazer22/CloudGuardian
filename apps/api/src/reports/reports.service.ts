import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { collectBackup } from './collectors/backup.collector';
import { collectCloudWatch } from './collectors/cloudwatch.collector';
import { collectInspector } from './collectors/inspector.collector';
import { collectTrendMicro } from './collectors/trendmicro.collector';
import type { ReportsPayload } from './types';

const CACHE_MS = 5 * 60_000;

@Injectable()
export class ReportsService {
  private cache = new Map<string, { at: number; data: ReportsPayload }>();

  constructor(private prisma: PrismaService) {}

  async get(accountId?: string, refresh = false): Promise<ReportsPayload> {
    const key = accountId ?? 'all';
    const hit = this.cache.get(key);
    if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;

    const accounts = await this.prisma.awsAccount.findMany({
      where: { enabled: true, mock: false, ...(accountId ? { id: accountId } : {}) },
      orderBy: { name: 'asc' },
    });

    const [cloudwatch, backup, trendmicro, inspector] = await Promise.all([
      collectCloudWatch(accounts),
      collectBackup(accounts),
      collectTrendMicro(accounts),
      collectInspector(accounts),
    ]);

    const errors = [...cloudwatch.errors, ...backup.errors, ...trendmicro.errors, ...inspector.errors];
    const data: ReportsPayload = {
      generatedAt: new Date().toISOString(),
      source: accounts.length ? 'live' : 'disconnected',
      errors,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, accountId: a.accountId, mock: a.mock, regions: a.regions })),
      cloudwatch,
      backup,
      trendmicro,
      inspector,
    };
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }
}
