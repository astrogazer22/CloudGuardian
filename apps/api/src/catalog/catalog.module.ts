import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma, Priority, TicketType } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsModule } from '../tickets/tickets.module';
import { TicketsService } from '../tickets/tickets.service';

const FIELD_TYPES = ['text', 'textarea', 'select', 'number', 'checkbox'] as const;

interface CatalogField {
  key: string;
  label: string;
  type: (typeof FIELD_TYPES)[number];
  required?: boolean;
  options?: string[];
  help?: string;
}

class CatalogItemDto {
  @IsString() @MinLength(1) name: string;
  @IsString() description: string;
  @IsOptional() @IsString() icon?: string;
  @IsString() @MinLength(1) category: string;
  @IsOptional() @IsEnum(TicketType) ticketType?: TicketType;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() teamId?: string | null;
  @IsArray() fields: CatalogField[];
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() visibleToRequesters?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

class CatalogRequestDto {
  @IsObject() values: Record<string, unknown>;
  @IsOptional() @IsString() summary?: string;
}

@Controller('catalog')
class CatalogController {
  constructor(
    private prisma: PrismaService,
    private tickets: TicketsService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('tickets:create')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.catalogItem.findMany({
      where: { active: true, ...(user.role === 'REQUESTER' ? { visibleToRequesters: true } : {}) },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  @RequirePermissions('catalog:manage')
  @Get('manage')
  manage() {
    return this.prisma.catalogItem.findMany({
      include: { _count: { select: { tickets: true } } },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  @RequirePermissions('tickets:create')
  @Get(':id')
  async get(@Param('id') id: string) {
    const item = await this.prisma.catalogItem.findFirst({ where: { id, active: true } });
    if (!item) throw new NotFoundException('Catalog item not found');
    return item;
  }

  @RequirePermissions('catalog:manage')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CatalogItemDto) {
    this.validateFields(dto.fields);
    const item = await this.prisma.catalogItem.create({
      data: { ...dto, teamId: dto.teamId || null, fields: dto.fields as unknown as Prisma.InputJsonValue },
    });
    await this.audit.log(actor.id, 'catalog.created', 'CatalogItem', item.id, { name: item.name });
    return item;
  }

  @RequirePermissions('catalog:manage')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: Partial<CatalogItemDto>) {
    if (dto.fields) this.validateFields(dto.fields);
    const item = await this.prisma.catalogItem.update({
      where: { id },
      data: {
        ...dto,
        ...('teamId' in dto ? { teamId: dto.teamId || null } : {}),
        fields: dto.fields as unknown as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.log(actor.id, 'catalog.updated', 'CatalogItem', id, { name: item.name });
    return item;
  }

  @RequirePermissions('catalog:manage')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.catalogItem.delete({ where: { id } });
    await this.audit.log(actor.id, 'catalog.deleted', 'CatalogItem', id);
    return { ok: true };
  }

  @RequirePermissions('tickets:create')
  @Post(':id/request')
  async request(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CatalogRequestDto) {
    const item = await this.prisma.catalogItem.findFirst({ where: { id, active: true } });
    if (!item || (user.role === 'REQUESTER' && !item.visibleToRequesters)) throw new NotFoundException('Catalog item not found');
    const fields = item.fields as unknown as CatalogField[];

    const values: Record<string, string | number | boolean> = {};
    const missing: string[] = [];
    for (const f of fields) {
      const raw = dto.values[f.key];
      const empty = raw === undefined || raw === null || raw === '' || (f.type === 'checkbox' && raw !== true && f.required);
      if (empty) {
        if (f.required) missing.push(f.label);
        continue;
      }
      if (f.type === 'number') {
        const n = Number(raw);
        if (Number.isNaN(n)) throw new BadRequestException(`${f.label} must be a number`);
        values[f.key] = n;
      } else if (f.type === 'checkbox') {
        values[f.key] = raw === true;
      } else if (f.type === 'select') {
        if (!f.options?.includes(String(raw))) throw new BadRequestException(`${f.label} must be one of: ${f.options?.join(', ')}`);
        values[f.key] = String(raw);
      } else {
        values[f.key] = String(raw).slice(0, 5000);
      }
    }
    if (missing.length) throw new BadRequestException(`Required: ${missing.join(', ')}`);

    const description = [
      item.description,
      '',
      ...fields
        .filter((f) => values[f.key] !== undefined)
        .map((f) => `**${f.label}:** ${f.type === 'checkbox' ? (values[f.key] ? 'Yes' : 'No') : values[f.key]}`),
    ].join('\n');

    return this.tickets.create(
      user,
      {
        title: `${item.name}${dto.summary?.trim() ? `: ${dto.summary.trim()}` : ''}`.slice(0, 200),
        description,
        type: item.ticketType,
        priority: item.priority,
        category: item.category,
        teamId: item.teamId ?? undefined,
        customFields: values,
        tags: ['catalog'],
        catalogItemId: item.id,
      },
      { trustedRouting: true },
    );
  }

  private validateFields(fields: CatalogField[]) {
    const keys = new Set<string>();
    for (const f of fields) {
      if (!f.key || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.key)) throw new BadRequestException(`Invalid field key "${f.key}"`);
      if (keys.has(f.key)) throw new BadRequestException(`Duplicate field key "${f.key}"`);
      keys.add(f.key);
      if (!f.label) throw new BadRequestException(`Field "${f.key}" needs a label`);
      if (!FIELD_TYPES.includes(f.type)) throw new BadRequestException(`Field "${f.key}" has invalid type`);
      if (f.type === 'select' && !f.options?.length) throw new BadRequestException(`Select field "${f.key}" needs options`);
    }
  }
}

@Module({ imports: [TicketsModule], controllers: [CatalogController] })
export class CatalogModule {}
