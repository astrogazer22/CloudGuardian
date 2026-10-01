import { Controller, Get, Module } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AccessService } from '../auth/access.service';
import { AuthUser, can } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

@Controller('dashboard')
class DashboardController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  @RequirePermissions('tickets:read')
  @Get()
  async summary(@CurrentUser() user: AuthUser) {
    const scope = this.access.ticketWhere(user);
    const assetScope = this.access.assetWhere(user);
    const open = { ...scope, statusCategory: { not: 'DONE' } };
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const since14 = new Date(Date.now() - 13 * 86_400_000);
    since14.setHours(0, 0, 0, 0);

    const [
      openCount,
      mineCount,
      unassigned,
      breached,
      byPriority,
      byType,
      byTeam,
      recentCreated,
      resolved30,
      pendingApprovals,
      assetsByType,
      degradedTargetGroups,
      accounts,
    ] = await Promise.all([
      this.prisma.ticket.count({ where: open }),
      this.prisma.ticket.count({ where: { ...open, assigneeId: user.id } }),
      this.prisma.ticket.count({ where: { ...open, assigneeId: null } }),
      this.prisma.ticket.count({ where: { ...open, slaBreached: true } }),
      this.prisma.ticket.groupBy({ by: ['priority'], where: open, _count: true }),
      this.prisma.ticket.groupBy({ by: ['type'], where: open, _count: true }),
      this.prisma.ticket.groupBy({ by: ['teamId'], where: open, _count: true }),
      this.prisma.ticket.findMany({ where: { ...scope, createdAt: { gte: since14 } }, select: { createdAt: true, resolvedAt: true } }),
      this.prisma.ticket.findMany({
        where: { ...scope, resolvedAt: { gte: since30 } },
        select: { createdAt: true, resolvedAt: true, slaBreached: true },
      }),
      can(user, 'approvals:decide')
        ? this.prisma.approvalRequest.count({
            where: { state: 'PENDING', ...(user.role === 'ADMIN' ? {} : { approverRole: { in: [user.roleKey, user.role] } }) },
          })
        : 0,
      can(user, 'inventory:read')
        ? this.prisma.asset.groupBy({ by: ['type'], where: { deletedAt: null, ...assetScope }, _count: true })
        : [],
      can(user, 'inventory:read')
        ? this.prisma.asset.count({ where: { deletedAt: null, type: 'TARGET_GROUP', state: 'degraded', ...assetScope } })
        : 0,
      can(user, 'inventory:read') ? this.prisma.awsAccount.count({ where: { enabled: true, mock: false } }) : 0,
    ]);

    const teams = await this.prisma.team.findMany({ select: { id: true, name: true } });
    const teamName = new Map(teams.map((t) => [t.id, t.name]));

    const days: { date: string; created: number; resolved: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(since14.getTime() + i * 86_400_000);
      days.push({ date: d.toISOString().slice(0, 10), created: 0, resolved: 0 });
    }
    const dayIndex = (dt: Date) => days.findIndex((d) => d.date === dt.toISOString().slice(0, 10));
    for (const t of recentCreated) {
      const i = dayIndex(t.createdAt);
      if (i >= 0) days[i].created++;
    }
    for (const t of resolved30) {
      const i = dayIndex(t.resolvedAt!);
      if (i >= 0) days[i].resolved++;
    }

    const mttrHours = resolved30.length
      ? resolved30.reduce((s, t) => s + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) / resolved30.length / 3_600_000
      : null;
    const slaCompliance = resolved30.length
      ? Math.round((resolved30.filter((t) => !t.slaBreached).length / resolved30.length) * 1000) / 10
      : null;

    return {
      tickets: {
        open: openCount,
        mine: mineCount,
        unassigned,
        breached,
        byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count])),
        byType: Object.fromEntries(byType.map((p) => [p.type, p._count])),
        byTeam: byTeam.map((t) => ({ team: t.teamId ? (teamName.get(t.teamId) ?? 'Unknown') : 'Unrouted', count: t._count })),
        trend: days,
        resolved30: resolved30.length,
        mttrHours: mttrHours === null ? null : Math.round(mttrHours * 10) / 10,
        slaCompliance,
      },
      approvals: { pending: pendingApprovals },
      inventory: {
        accounts,
        byType: Object.fromEntries((assetsByType as { type: string; _count: number }[]).map((a) => [a.type, a._count])),
        degradedTargetGroups,
      },
    };
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
