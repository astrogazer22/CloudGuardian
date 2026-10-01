import { Body, Controller, Delete, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

class TeamDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsArray() memberIds?: string[];
  @IsOptional() @IsString() leadId?: string | null;
  @IsOptional() @IsString() calendarId?: string | null;
}

class UpdateTeamDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsArray() memberIds?: string[];
  @IsOptional() @IsString() leadId?: string | null;
  @IsOptional() @IsString() calendarId?: string | null;
}

const teamInclude = {
  lead: { select: { id: true, name: true } },
  calendar: { select: { id: true, name: true, timezone: true } },
  members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
  _count: { select: { tickets: { where: { statusCategory: { not: 'DONE' } } } } },
};

@Controller('teams')
class TeamsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('tickets:read')
  @Get()
  list() {
    return this.prisma.team.findMany({ include: teamInclude, orderBy: { name: 'asc' } });
  }

  @RequirePermissions('users:manage')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: TeamDto) {
    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        description: dto.description,
        email: dto.email,
        leadId: dto.leadId || null,
        calendarId: dto.calendarId || null,
        members: dto.memberIds?.length ? { create: dto.memberIds.map((userId) => ({ userId })) } : undefined,
      },
      include: teamInclude,
    });
    await this.audit.log(actor.id, 'team.created', 'Team', team.id, { name: dto.name });
    return team;
  }

  @RequirePermissions('users:manage')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateTeamDto) {
    const { memberIds, ...rest } = dto;
    const data = {
      ...rest,
      ...('leadId' in dto ? { leadId: dto.leadId || null } : {}),
      ...('calendarId' in dto ? { calendarId: dto.calendarId || null } : {}),
    };
    const team = await this.prisma.$transaction(async (tx) => {
      if (memberIds) {
        await tx.teamMember.deleteMany({ where: { teamId: id } });
        await tx.teamMember.createMany({ data: memberIds.map((userId) => ({ userId, teamId: id })) });
      }
      return tx.team.update({ where: { id }, data, include: teamInclude });
    });
    await this.audit.log(actor.id, 'team.updated', 'Team', id, dto as any);
    return team;
  }

  @RequirePermissions('users:manage')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.team.delete({ where: { id } });
    await this.audit.log(actor.id, 'team.deleted', 'Team', id);
    return { ok: true };
  }
}

@Module({ controllers: [TeamsController] })
export class TeamsModule {}
