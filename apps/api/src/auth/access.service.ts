import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS, AuthUser, SYSTEM_ROLES } from './permissions';

@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  /** Resolves the effective permissions and data scopes for a user, or null if inactive/missing. */
  async load(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roleDef: true, teams: { select: { teamId: true } } },
    });
    if (!user || !user.active) return null;

    const def = user.roleDef ?? (await this.prisma.roleDefinition.findUnique({ where: { key: user.role } }));
    const fallback = SYSTEM_ROLES[user.role];
    const isAdmin = (def?.key ?? user.role) === 'ADMIN';
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roleKey: def?.key ?? user.role,
      roleName: def?.name ?? fallback.name,
      permissions: isAdmin ? [...ALL_PERMISSIONS] : (def?.permissions ?? fallback.permissions),
      ticketScope: isAdmin ? 'ALL' : (def?.ticketScope ?? fallback.ticketScope),
      inventoryEnvironments: isAdmin ? [] : (def?.inventoryEnvironments ?? []),
      teamIds: user.teams.map((t) => t.teamId),
    };
  }

  ticketWhere(user: AuthUser): Prisma.TicketWhereInput {
    switch (user.ticketScope) {
      case 'OWN':
        return { OR: [{ requesterId: user.id }, { assigneeId: user.id }] };
      case 'TEAM':
        return { OR: [{ teamId: { in: user.teamIds } }, { requesterId: user.id }, { assigneeId: user.id }] };
      default:
        return {};
    }
  }

  assetWhere(user: AuthUser): Prisma.AssetWhereInput {
    return user.inventoryEnvironments.length ? { environment: { in: user.inventoryEnvironments } } : {};
  }

  /** Users covered by a workflow role reference (role key or base role). */
  usersForRoleRef(ref: string) {
    const isBaseRole = (Object.values(Role) as string[]).includes(ref);
    return this.prisma.user.findMany({
      where: {
        active: true,
        OR: [{ roleDef: { key: ref } }, ...(isBaseRole ? [{ role: ref as Role }] : []), { role: 'ADMIN' }],
      },
      select: { id: true },
    });
  }
}
