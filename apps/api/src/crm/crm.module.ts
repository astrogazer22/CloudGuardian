import { Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomerTier } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

class OrganizationDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsEnum(CustomerTier) tier?: CustomerTier;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() notes?: string;
}

class ContactDto {
  @IsString() @MinLength(1) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() organizationId?: string;
}

const openTickets = { where: { statusCategory: { not: 'DONE' } } };

@Controller('organizations')
class OrganizationsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('crm:read')
  @Get()
  list(@Query('q') q?: string) {
    return this.prisma.organization.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      include: { _count: { select: { contacts: true, tickets: openTickets } } },
      orderBy: { name: 'asc' },
    });
  }

  @RequirePermissions('crm:read')
  @Get(':id')
  async get(@Param('id') id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { name: 'asc' } },
        tickets: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            statusCategory: true,
            priority: true,
            createdAt: true,
            slaBreached: true,
          },
        },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  @RequirePermissions('crm:write')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: OrganizationDto) {
    const org = await this.prisma.organization.create({ data: dto });
    await this.audit.log(actor.id, 'organization.created', 'Organization', org.id, { name: org.name });
    return org;
  }

  @RequirePermissions('crm:write')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: Partial<OrganizationDto>) {
    const org = await this.prisma.organization.update({ where: { id }, data: dto });
    await this.audit.log(actor.id, 'organization.updated', 'Organization', id, dto as any);
    return org;
  }

  @RequirePermissions('crm:write')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.organization.delete({ where: { id } });
    await this.audit.log(actor.id, 'organization.deleted', 'Organization', id);
    return { ok: true };
  }
}

@Controller('contacts')
class ContactsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('crm:read')
  @Get()
  list(@Query('q') q?: string, @Query('organizationId') organizationId?: string) {
    return this.prisma.contact.findMany({
      where: {
        organizationId,
        ...(q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      include: { organization: { select: { id: true, name: true } }, _count: { select: { tickets: openTickets } } },
      orderBy: { name: 'asc' },
    });
  }

  @RequirePermissions('crm:write')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: ContactDto) {
    const contact = await this.prisma.contact.create({ data: { ...dto, email: dto.email.toLowerCase() } });
    await this.audit.log(actor.id, 'contact.created', 'Contact', contact.id, { email: contact.email });
    return contact;
  }

  @RequirePermissions('crm:write')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: Partial<ContactDto>) {
    const contact = await this.prisma.contact.update({ where: { id }, data: dto });
    await this.audit.log(actor.id, 'contact.updated', 'Contact', id, dto as any);
    return contact;
  }

  @RequirePermissions('crm:write')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.contact.delete({ where: { id } });
    await this.audit.log(actor.id, 'contact.deleted', 'Contact', id);
    return { ok: true };
  }
}

@Module({ controllers: [OrganizationsController, ContactsController] })
export class CrmModule {}
