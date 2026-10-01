import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { KbStatus, KbVisibility, Prisma } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser, can } from '../auth/permissions';
import { IntegrationsService } from '../integrations/integrations.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';

class CategoryDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

class ArticleDto {
  @IsString() @MinLength(3) title: string;
  @IsString() body: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @IsEnum(KbVisibility) visibility?: KbVisibility;
  @IsOptional() @IsArray() tags?: string[];
}

class StatusDto {
  @IsEnum(KbStatus) status: KbStatus;
}

class FeedbackDto {
  @IsBoolean() helpful: boolean;
}

const STOPWORDS = new Set(
  'the and for with from that this have has are was were been not can cant cannot how what why when where who our your their you they them its into onto about after before over under please help need issue problem error unable getting able'.split(
    ' ',
  ),
);

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'article'
  );
}

const listSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  status: true,
  visibility: true,
  tags: true,
  views: true,
  helpfulYes: true,
  helpfulNo: true,
  version: true,
  publishedAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  author: { select: { id: true, name: true } },
} satisfies Prisma.KbArticleSelect;

@Controller('kb')
class KbController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private integrations: IntegrationsService,
  ) {}

  /** Authors see drafts; only users who can see internal notes see INTERNAL articles. */
  private visible(user: AuthUser): Prisma.KbArticleWhereInput {
    const author = can(user, 'kb:write') || can(user, 'kb:publish');
    return {
      ...(author ? {} : { status: 'PUBLISHED' }),
      ...(can(user, 'tickets:view_internal') ? {} : { visibility: 'PUBLIC' }),
    };
  }

  private published(user: AuthUser): Prisma.KbArticleWhereInput {
    return { status: 'PUBLISHED', ...(can(user, 'tickets:view_internal') ? {} : { visibility: 'PUBLIC' }) };
  }

  // ─── Categories ──────────────────────────────────────────────────────────

  @RequirePermissions('kb:read')
  @Get('categories')
  async categories(@CurrentUser() user: AuthUser) {
    const cats = await this.prisma.kbCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const counts = await this.prisma.kbArticle.groupBy({ by: ['categoryId'], where: this.published(user), _count: true });
    return cats.map((c) => ({ ...c, articleCount: counts.find((x) => x.categoryId === c.id)?._count ?? 0 }));
  }

  @RequirePermissions('kb:publish')
  @Post('categories')
  createCategory(@Body() dto: CategoryDto) {
    return this.prisma.kbCategory.create({ data: dto });
  }

  @RequirePermissions('kb:publish')
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: Partial<CategoryDto>) {
    return this.prisma.kbCategory.update({ where: { id }, data: dto });
  }

  @RequirePermissions('kb:publish')
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    await this.prisma.kbCategory.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Articles ────────────────────────────────────────────────────────────

  @RequirePermissions('kb:read')
  @Get('articles')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: KbStatus,
    @Query('sort') sort?: 'popular' | 'recent',
    @Query('take') take = '100',
  ) {
    const term = q?.trim();
    return this.prisma.kbArticle.findMany({
      where: {
        AND: [
          this.visible(user),
          categoryId ? { categoryId } : {},
          status ? { status } : {},
          term
            ? {
                OR: [
                  { title: { contains: term, mode: 'insensitive' } },
                  { body: { contains: term, mode: 'insensitive' } },
                  { tags: { has: term.toLowerCase() } },
                ],
              }
            : {},
        ],
      },
      select: listSelect,
      orderBy: sort === 'popular' ? [{ views: 'desc' }] : [{ updatedAt: 'desc' }],
      take: Math.min(Number(take) || 100, 200),
    });
  }

  /** Relevance-ranked published articles for free text (ticket title/description) — used for deflection and agent suggestions. */
  @RequirePermissions('kb:read')
  @Get('suggest')
  async suggest(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    const tokens = [...new Set((q.toLowerCase().match(/[a-z0-9][a-z0-9.-]{2,}/g) ?? []).filter((t) => !STOPWORDS.has(t)))].slice(0, 8);
    if (!tokens.length) return [];
    const candidates = await this.prisma.kbArticle.findMany({
      where: {
        AND: [
          this.published(user),
          {
            OR: tokens.flatMap((t) => [
              { title: { contains: t, mode: 'insensitive' as const } },
              { body: { contains: t, mode: 'insensitive' as const } },
              { tags: { has: t } },
            ]),
          },
        ],
      },
      select: { id: true, title: true, slug: true, excerpt: true, body: true, tags: true, helpfulYes: true },
      take: 50,
    });
    return candidates
      .map((a) => {
        const title = a.title.toLowerCase();
        const body = a.body.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (title.includes(t)) score += 5;
          if (a.tags.includes(t)) score += 4;
          score += Math.min(body.split(t).length - 1, 3);
        }
        return { id: a.id, title: a.title, slug: a.slug, excerpt: a.excerpt ?? a.body.slice(0, 160), score: score + Math.min(a.helpfulYes, 5) * 0.1 };
      })
      .filter((a) => a.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  @RequirePermissions('kb:read')
  @Get('articles/:idOrSlug')
  async get(@CurrentUser() user: AuthUser, @Param('idOrSlug') idOrSlug: string, @Query('view') view?: string) {
    const article = await this.prisma.kbArticle.findFirst({
      where: { AND: [this.visible(user), { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }] },
      include: { category: { select: { id: true, name: true } }, author: { select: { id: true, name: true } } },
    });
    if (!article) throw new NotFoundException('Article not found');
    if (view === '1' && article.status === 'PUBLISHED') {
      await this.prisma.kbArticle.update({ where: { id: article.id }, data: { views: { increment: 1 } } });
    }
    return article;
  }

  @RequirePermissions('kb:write')
  @Post('articles')
  async create(@CurrentUser() user: AuthUser, @Body() dto: ArticleDto) {
    const slug = await this.uniqueSlug(dto.title);
    const article = await this.prisma.kbArticle.create({
      data: {
        ...dto,
        tags: (dto.tags ?? []).map((t) => t.toLowerCase()),
        slug,
        authorId: user.id,
        versions: { create: { version: 1, title: dto.title, body: dto.body, editorId: user.id } },
      },
    });
    await this.audit.log(user.id, 'kb.created', 'KbArticle', article.id, { title: article.title });
    return article;
  }

  @RequirePermissions('kb:write')
  @Patch('articles/:id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<ArticleDto>) {
    const article = await this.prisma.kbArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article not found');
    if (article.status === 'PUBLISHED' && !can(user, 'kb:publish')) {
      throw new ForbiddenException('Only publishers can edit a published article');
    }
    const contentChanged = (dto.title && dto.title !== article.title) || (dto.body !== undefined && dto.body !== article.body);
    const version = contentChanged ? article.version + 1 : article.version;
    const updated = await this.prisma.kbArticle.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.tags ? { tags: dto.tags.map((t) => t.toLowerCase()) } : {}),
        version,
        ...(contentChanged
          ? {
              versions: {
                create: { version, title: dto.title ?? article.title, body: dto.body ?? article.body, editorId: user.id },
              },
            }
          : {}),
      },
    });
    await this.audit.log(user.id, 'kb.updated', 'KbArticle', id, { version });
    return updated;
  }

  @RequirePermissions('kb:write')
  @Post('articles/:id/status')
  async setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    const article = await this.prisma.kbArticle.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article not found');
    if (['PUBLISHED', 'ARCHIVED'].includes(dto.status) && !can(user, 'kb:publish')) {
      throw new ForbiddenException('Only publishers can publish or archive articles');
    }
    if (article.status === dto.status) throw new BadRequestException(`Article is already ${dto.status.toLowerCase()}`);

    const updated = await this.prisma.kbArticle.update({
      where: { id },
      data: { status: dto.status, ...(dto.status === 'PUBLISHED' ? { publishedAt: new Date() } : {}) },
    });
    await this.audit.log(user.id, `kb.${dto.status.toLowerCase()}`, 'KbArticle', id, { title: article.title });

    if (dto.status === 'IN_REVIEW') {
      const publisherRoles = await this.prisma.roleDefinition.findMany({ where: { permissions: { has: 'kb:publish' } } });
      const publishers = await this.prisma.user.findMany({
        where: { active: true, OR: [{ role: 'ADMIN' }, { roleId: { in: publisherRoles.map((r) => r.id) } }] },
        select: { id: true },
      });
      await this.notifications.notify(
        publishers.map((p) => p.id),
        'Article ready for review',
        article.title,
        `/knowledge/${id}`,
        user.id,
      );
    }
    if (dto.status === 'PUBLISHED') {
      await this.notifications.notify([article.authorId], 'Your article was published', article.title, `/knowledge/${id}`, user.id);
      if (article.visibility === 'PUBLIC') {
        this.integrations.dispatch('kb.published', {
          title: `New article: ${article.title}`,
          text: article.excerpt ?? article.body.slice(0, 200),
          link: `/portal/kb/${article.slug}`,
          fields: [['Published by', user.name]],
        });
      }
    }
    return updated;
  }

  @RequirePermissions('kb:read')
  @Post('articles/:id/feedback')
  async feedback(@Param('id') id: string, @Body() dto: FeedbackDto) {
    await this.prisma.kbArticle.update({
      where: { id },
      data: dto.helpful ? { helpfulYes: { increment: 1 } } : { helpfulNo: { increment: 1 } },
    });
    return { ok: true };
  }

  @RequirePermissions('kb:write')
  @Get('articles/:id/versions')
  versions(@Param('id') id: string) {
    return this.prisma.kbArticleVersion.findMany({
      where: { articleId: id },
      include: { editor: { select: { id: true, name: true } } },
      orderBy: { version: 'desc' },
    });
  }

  @RequirePermissions('kb:publish')
  @Delete('articles/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.kbArticle.delete({ where: { id } });
    await this.audit.log(user.id, 'kb.deleted', 'KbArticle', id);
    return { ok: true };
  }

  private async uniqueSlug(title: string) {
    const base = slugify(title);
    let slug = base;
    for (let i = 2; await this.prisma.kbArticle.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }
}

@Module({ controllers: [KbController] })
export class KbModule {}
