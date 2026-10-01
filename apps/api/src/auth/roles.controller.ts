import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Role, TicketScope } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, RequirePermissions } from './decorators';
import { ALL_PERMISSIONS, AuthUser, PERMISSION_GROUPS } from './permissions';

class CreateRoleDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/, { message: 'key must be UPPER_SNAKE_CASE (2–32 chars)' }) key: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(Role) baseRole: Role;
  @IsArray() permissions: string[];
  @IsEnum(TicketScope) ticketScope: TicketScope;
  @IsOptional() @IsArray() inventoryEnvironments?: string[];
}

class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Role) baseRole?: Role;
  @IsOptional() @IsArray() permissions?: string[];
  @IsOptional() @IsEnum(TicketScope) ticketScope?: TicketScope;
  @IsOptional() @IsArray() inventoryEnvironments?: string[];
}

@Controller('roles')
export class RolesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.roleDefinition.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  @Get('permissions')
  permissions() {
    return PERMISSION_GROUPS.map((g) => ({ group: g.group, items: g.items.map(([key, label]) => ({ key, label })) }));
  }

  @RequirePermissions('roles:manage')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CreateRoleDto) {
    this.assertPermissions(dto.permissions);
    if (await this.prisma.roleDefinition.findUnique({ where: { key: dto.key } })) {
      throw new BadRequestException(`A role with key ${dto.key} already exists`);
    }
    const role = await this.prisma.roleDefinition.create({
      data: { ...dto, inventoryEnvironments: dto.inventoryEnvironments ?? [], isSystem: false },
    });
    await this.audit.log(actor.id, 'role.created', 'RoleDefinition', role.id, { key: role.key, permissions: role.permissions });
    return role;
  }

  @RequirePermissions('roles:manage')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.prisma.roleDefinition.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.key === 'ADMIN' && (dto.permissions || dto.ticketScope || dto.inventoryEnvironments || dto.baseRole)) {
      throw new BadRequestException('The Administrator role always has full access');
    }
    if (role.isSystem && dto.baseRole && dto.baseRole !== role.baseRole) {
      throw new BadRequestException('The base role of a system role cannot change');
    }
    if (dto.permissions) this.assertPermissions(dto.permissions);

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.roleDefinition.update({ where: { id }, data: dto });
      if (dto.baseRole) await tx.user.updateMany({ where: { roleId: id }, data: { role: dto.baseRole } });
      return r;
    });
    await this.audit.log(actor.id, 'role.updated', 'RoleDefinition', id, { key: role.key, ...dto });
    return updated;
  }

  @RequirePermissions('roles:manage')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    const role = await this.prisma.roleDefinition.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    if (role._count.users) throw new BadRequestException(`Reassign the ${role._count.users} user(s) with this role first`);
    await this.prisma.roleDefinition.delete({ where: { id } });
    await this.audit.log(actor.id, 'role.deleted', 'RoleDefinition', id, { key: role.key });
    return { ok: true };
  }

  private assertPermissions(perms: string[]) {
    const unknown = perms.filter((p) => !(ALL_PERMISSIONS as string[]).includes(p));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
  }
}
