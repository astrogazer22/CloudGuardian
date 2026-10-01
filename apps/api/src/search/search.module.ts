import { Controller, Get, Module, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { AccessService } from '../auth/access.service';
import { AuthUser, can } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

@Controller('search')
class SearchController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  /** Powers the ⌘K command palette. Results are limited to what the caller can see. */
  @Get()
  async search(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    const term = q.trim();
    if (term.length < 2) return { tickets: [], assets: [], organizations: [], contacts: [], articles: [] };
    const contains = { contains: term, mode: 'insensitive' as const };
    const num = Number(term.replace(/^#/, ''));

    const [tickets, assets, organizations, contacts, articles] = await Promise.all([
      this.prisma.ticket.findMany({
        where: {
          AND: [
            this.access.ticketWhere(user),
            { OR: [{ title: contains }, ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : [])] },
          ],
        },
        select: { id: true, number: true, title: true, status: true, priority: true },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      can(user, 'inventory:read')
        ? this.prisma.asset.findMany({
            where: { deletedAt: null, ...this.access.assetWhere(user), OR: [{ name: contains }, { resourceId: contains }] },
            select: { id: true, name: true, type: true, region: true, state: true },
            take: 8,
          })
        : [],
      can(user, 'crm:read')
        ? this.prisma.organization.findMany({ where: { name: contains }, select: { id: true, name: true }, take: 5 })
        : [],
      can(user, 'crm:read')
        ? this.prisma.contact.findMany({
            where: { OR: [{ name: contains }, { email: contains }] },
            select: { id: true, name: true, email: true, organizationId: true },
            take: 5,
          })
        : [],
      can(user, 'kb:read')
        ? this.prisma.kbArticle.findMany({
            where: {
              status: 'PUBLISHED',
              ...(can(user, 'tickets:view_internal') ? {} : { visibility: 'PUBLIC' as const }),
              OR: [{ title: contains }, { tags: { has: term.toLowerCase() } }],
            },
            select: { id: true, title: true, slug: true },
            take: 5,
          })
        : [],
    ]);
    return { tickets, assets, organizations, contacts, articles };
  }
}

@Module({ controllers: [SearchController] })
export class SearchModule {}
