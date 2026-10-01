import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { AssetType, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../auth/access.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { callerIdentity, storedCreds, toPublicAccount } from '../aws/credentials';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsModule } from '../tickets/tickets.module';
import { AwsCollector } from './collectors/aws.collector';
import { MockCollector } from './collectors/mock.collector';
import { onboardingTemplate } from './onboarding-template';
import { SyncService } from './sync.service';

class CreateAwsAccountDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @Matches(/^\d{12}$/, { message: 'accountId must be a 12-digit AWS account ID' }) accountId?: string;
  @IsOptional() @Matches(/^arn:aws[\w-]*:iam::\d{12}:role\/.+$/, { message: 'roleArn must be an IAM role ARN' })
  roleArn?: string;
  @IsOptional() @IsString() accessKeyId?: string;
  @IsOptional() @IsString() secretAccessKey?: string;
  @IsOptional() @IsString() sessionToken?: string;
  @IsArray() @ArrayMinSize(1) regions: string[];
  @IsOptional() @IsBoolean() useDefaultCredentials?: boolean;
}

class UpdateAwsAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() roleArn?: string;
  @IsOptional() @IsString() accessKeyId?: string;
  @IsOptional() @IsString() secretAccessKey?: string;
  @IsOptional() @IsString() sessionToken?: string;
  @IsOptional() @IsArray() regions?: string[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}

class ProbeDto {
  @IsOptional() @IsString() accessKeyId?: string;
  @IsOptional() @IsString() secretAccessKey?: string;
  @IsOptional() @IsString() sessionToken?: string;
  @IsOptional() @IsString() region?: string;
}

class ListAssetsQuery {
  @IsOptional() @IsEnum(AssetType) type?: AssetType;
  @IsOptional() @IsString() awsAccountId?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() environment?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() includeDeleted?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number;
}

const assetBrief = { select: { id: true, name: true, type: true, state: true, region: true, resourceId: true } } as const;

@Controller('aws-accounts')
class AwsAccountsController {
  constructor(
    private prisma: PrismaService,
    private sync: SyncService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('inventory:read')
  @Get()
  async list() {
    const accounts = await this.prisma.awsAccount.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { assets: { where: { deletedAt: null } } } },
        syncRuns: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });
    return accounts.map(({ syncRuns, ...a }) => ({ ...toPublicAccount(a), lastRun: syncRuns[0] ?? null }));
  }

  @RequirePermissions('inventory:manage')
  @Get('identity')
  async identity() {
    try {
      const identity = await callerIdentity();
      return { ok: true, identity, source: 'default' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  @RequirePermissions('inventory:manage')
  @Post('identity/probe')
  async probe(@Body() dto: ProbeDto) {
    try {
      const credentials = dto.accessKeyId && dto.secretAccessKey ? storedCreds(dto as any) : undefined;
      const identity = await callerIdentity(credentials, dto.region);
      return { ok: true, identity };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  @RequirePermissions('inventory:manage')
  @Get('onboarding/template')
  template(@Query('externalId') externalId?: string) {
    return {
      principalArn: process.env.CLOUDGUARDIAN_PRINCIPAL_ARN ?? 'arn:aws:iam::<CLOUDGUARDIAN_ACCOUNT_ID>:role/cloudguardian',
      template: onboardingTemplate(
        process.env.CLOUDGUARDIAN_PRINCIPAL_ARN ?? 'arn:aws:iam::<CLOUDGUARDIAN_ACCOUNT_ID>:role/cloudguardian',
        externalId ?? '<EXTERNAL_ID>',
      ),
    };
  }

  @RequirePermissions('inventory:manage')
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CreateAwsAccountDto) {
    const credentials = dto.accessKeyId && dto.secretAccessKey ? storedCreds(dto as any) : undefined;
    let identity;
    try {
      identity = await callerIdentity(credentials, dto.regions[0]);
    } catch (err) {
      if (dto.roleArn && dto.accountId) {
        identity = { accountId: dto.accountId, arn: dto.roleArn, userId: 'pending-assume-role' };
      } else {
        throw new BadRequestException(
          `Could not reach AWS (${err instanceof Error ? err.message : String(err)}). Provide working access keys, configure the API credential chain, or supply a role ARN and account ID.`,
        );
      }
    }
    const accountId = dto.accountId ?? identity.accountId;
    if (dto.accountId && dto.accountId !== identity.accountId && !dto.roleArn) {
      throw new BadRequestException(`Those credentials belong to account ${identity.accountId}, not ${dto.accountId}`);
    }
    const existing = await this.prisma.awsAccount.findUnique({ where: { accountId } });
    const data = {
      name: dto.name || `AWS ${accountId}`,
      accountId,
      roleArn: dto.roleArn,
      accessKeyId: dto.accessKeyId,
      secretAccessKey: dto.secretAccessKey,
      sessionToken: dto.sessionToken,
      regions: dto.regions,
      mock: false,
      enabled: true,
    };
    const account = existing
      ? await this.prisma.awsAccount.update({ where: { id: existing.id }, data })
      : await this.prisma.awsAccount.create({ data: { ...data, externalId: randomUUID() } });
    await this.audit.log(actor.id, existing ? 'aws_account.updated' : 'aws_account.created', 'AwsAccount', account.id, {
      accountId,
      auth: dto.accessKeyId ? 'keys' : dto.roleArn ? 'role' : 'default',
    });
    await this.sync.enqueue(account.id);
    return toPublicAccount(account);
  }

  @RequirePermissions('inventory:manage')
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateAwsAccountDto) {
    const data: Prisma.AwsAccountUpdateInput = {
      name: dto.name,
      roleArn: dto.roleArn,
      regions: dto.regions,
      enabled: dto.enabled,
    };
    if (dto.accessKeyId) data.accessKeyId = dto.accessKeyId;
    if (dto.secretAccessKey) data.secretAccessKey = dto.secretAccessKey;
    if (dto.sessionToken !== undefined) data.sessionToken = dto.sessionToken;
    const account = await this.prisma.awsAccount.update({ where: { id }, data });
    await this.audit.log(actor.id, 'aws_account.updated', 'AwsAccount', id, { ...dto, secretAccessKey: dto.secretAccessKey ? '[redacted]' : undefined });
    return toPublicAccount(account);
  }

  @RequirePermissions('inventory:manage')
  @Delete(':id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.awsAccount.delete({ where: { id } });
    await this.audit.log(actor.id, 'aws_account.deleted', 'AwsAccount', id);
    return { ok: true };
  }

  @RequirePermissions('inventory:manage')
  @Post(':id/sync')
  async triggerSync(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    const run = await this.sync.enqueue(id);
    await this.audit.log(actor.id, 'aws_account.sync_requested', 'AwsAccount', id);
    return run;
  }

  @RequirePermissions('inventory:read')
  @Get(':id/runs')
  runs(@Param('id') id: string) {
    return this.prisma.syncRun.findMany({ where: { awsAccountId: id }, orderBy: { startedAt: 'desc' }, take: 25 });
  }
}

@Controller('assets')
class AssetsController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  @RequirePermissions('inventory:read')
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: ListAssetsQuery) {
    const where: Prisma.AssetWhereInput = {
      AND: [this.access.assetWhere(user)],
      type: q.type,
      awsAccountId: q.awsAccountId,
      region: q.region,
      environment: q.environment,
      state: q.state,
      deletedAt: q.includeDeleted === 'true' ? undefined : null,
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { resourceId: { contains: q.q, mode: 'insensitive' } },
              { arn: { contains: q.q, mode: 'insensitive' } },
              { owner: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        include: {
          awsAccount: { select: { id: true, name: true, accountId: true } },
          _count: { select: { tickets: { where: { ticket: { statusCategory: { not: 'DONE' } } } } } },
        },
        orderBy: [{ environment: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.asset.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  @RequirePermissions('inventory:read')
  @Get('facets')
  async facets(@CurrentUser() user: AuthUser, @Query('type') type?: AssetType) {
    const where = { deletedAt: null, type, ...this.access.assetWhere(user) };
    const [regions, environments, states] = await Promise.all([
      this.prisma.asset.groupBy({ by: ['region'], where, _count: true, orderBy: { region: 'asc' } }),
      this.prisma.asset.groupBy({ by: ['environment'], where, _count: true, orderBy: { environment: 'asc' } }),
      this.prisma.asset.groupBy({ by: ['state'], where, _count: true, orderBy: { state: 'asc' } }),
    ]);
    return {
      regions: regions.map((r) => ({ value: r.region, count: r._count })),
      environments: environments.filter((e) => e.environment).map((e) => ({ value: e.environment!, count: e._count })),
      states: states.map((s) => ({ value: s.state, count: s._count })),
    };
  }

  @RequirePermissions('inventory:read')
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, ...this.access.assetWhere(user) },
      include: {
        awsAccount: { select: { id: true, name: true, accountId: true } },
        outgoing: { include: { to: assetBrief } },
        incoming: { include: { from: assetBrief } },
        tickets: {
          include: {
            ticket: {
              select: { id: true, number: true, title: true, status: true, statusCategory: true, priority: true, createdAt: true },
            },
          },
        },
        changes: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
}

@Module({
  imports: [TicketsModule],
  controllers: [AwsAccountsController, AssetsController],
  providers: [SyncService, AwsCollector, MockCollector],
})
export class InventoryModule {}
