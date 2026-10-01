import { BadRequestException, Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(8) password: string;
  @IsString() roleId: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsArray() teamIds?: string[];
  @IsOptional() @IsArray() skills?: string[];
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsArray() teamIds?: string[];
  @IsOptional() @IsArray() skills?: string[];
}

class ResetPasswordDto {
  @IsString() @MinLength(8) password: string;
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  roleDef: { select: { id: true, key: true, name: true } },
  active: true,
  title: true,
  timezone: true,
  skills: true,
  lastLoginAt: true,
  createdAt: true,
  teams: { select: { team: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

@Controller('users')
class UsersController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Lightweight directory for pickers (assignee, approver, etc.). */
  @RequirePermissions('tickets:read')
  @Get('directory')
  directory() {
    return this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  @RequirePermissions('users:manage')
  @Get()
  list(@Query('q') q?: string) {
    return this.prisma.user.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
        : undefined,
      select: userSelect,
      orderBy: { name: 'asc' },
    });
  }

  @RequirePermissions('users:manage')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new BadRequestException('A user with this email already exists');
    }
    const roleDef = await this.roleOrThrow(dto.roleId);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        role: roleDef.baseRole,
        roleId: roleDef.id,
        title: dto.title,
        skills: dto.skills ?? [],
        passwordHash: await bcrypt.hash(dto.password, 10),
        teams: dto.teamIds?.length ? { create: dto.teamIds.map((teamId) => ({ teamId })) } : undefined,
      },
      select: userSelect,
    });
    await this.audit.log(actor.id, 'user.created', 'User', user.id, { email, role: roleDef.key });
    return user;
  }

  @RequirePermissions('users:manage')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    const roleDef = dto.roleId ? await this.roleOrThrow(dto.roleId) : null;
    if (id === actor.id && (dto.active === false || (roleDef && roleDef.key !== 'ADMIN'))) {
      throw new BadRequestException('You cannot deactivate or demote yourself');
    }
    const { teamIds, roleId, ...rest } = dto;
    const data: Prisma.UserUncheckedUpdateInput = { ...rest, ...(roleDef ? { roleId: roleDef.id, role: roleDef.baseRole } : {}) };
    const user = await this.prisma.$transaction(async (tx) => {
      if (teamIds) {
        await tx.teamMember.deleteMany({ where: { userId: id } });
        await tx.teamMember.createMany({ data: teamIds.map((teamId) => ({ teamId, userId: id })) });
      }
      return tx.user.update({ where: { id }, data, select: userSelect });
    });
    await this.audit.log(actor.id, 'user.updated', 'User', id, dto as any);
    return user;
  }

  @RequirePermissions('users:manage')
  @Post(':id/reset-password')
  async resetPassword(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(dto.password, 10) } });
    await this.audit.log(actor.id, 'user.password_reset', 'User', id);
    return { ok: true };
  }

  private async roleOrThrow(id: string) {
    const role = await this.prisma.roleDefinition.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('Unknown role');
    return role;
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
