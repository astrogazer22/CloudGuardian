import { BadRequestException, Body, Controller, Delete, Get, Global, Module, Param, Patch, Post } from '@nestjs/common';
import { ChannelKind, IntegrationChannel, Priority } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { INTEGRATION_EVENTS, IntegrationsService } from './integrations.service';

class ChannelDto {
  @IsString() @MinLength(1) name: string;
  @IsEnum(ChannelKind) kind: ChannelKind;
  @IsUrl({ protocols: ['https'], require_protocol: true }) webhookUrl: string;
  @IsArray() events: string[];
  @IsOptional() @IsArray() @IsEnum(Priority, { each: true }) priorities?: Priority[];
  @IsOptional() @IsArray() teamIds?: string[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}

class UpdateChannelDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) webhookUrl?: string;
  @IsOptional() @IsArray() events?: string[];
  @IsOptional() @IsArray() @IsEnum(Priority, { each: true }) priorities?: Priority[];
  @IsOptional() @IsArray() teamIds?: string[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}

/** Webhook URLs are credentials — only ever return a masked form. */
function mask(c: IntegrationChannel) {
  const { webhookUrl, ...rest } = c;
  let host = '';
  try {
    host = new URL(webhookUrl).host;
  } catch {}
  return { ...rest, webhookUrlMasked: `https://${host}/…${webhookUrl.slice(-6)}` };
}

@Controller('integrations')
class IntegrationsController {
  constructor(
    private prisma: PrismaService,
    private integrations: IntegrationsService,
    private audit: AuditService,
  ) {}

  @RequirePermissions('integrations:manage')
  @Get('events')
  events() {
    return INTEGRATION_EVENTS;
  }

  @RequirePermissions('integrations:manage')
  @Get('slack/status')
  slackStatus() {
    const api = (process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '');
    return {
      signingSecretConfigured: !!process.env.SLACK_SIGNING_SECRET,
      botTokenConfigured: !!process.env.SLACK_BOT_TOKEN,
      commandUrl: `${api}/api/integrations/slack/commands`,
      interactionsUrl: `${api}/api/integrations/slack/interactions`,
    };
  }

  @RequirePermissions('integrations:manage')
  @Get('channels')
  async list() {
    return (await this.prisma.integrationChannel.findMany({ orderBy: { name: 'asc' } })).map(mask);
  }

  @RequirePermissions('integrations:manage')
  @Post('channels')
  async create(@CurrentUser() actor: AuthUser, @Body() dto: ChannelDto) {
    this.assertEvents(dto.events);
    const c = await this.prisma.integrationChannel.create({
      data: { ...dto, priorities: dto.priorities ?? [], teamIds: dto.teamIds ?? [] },
    });
    await this.audit.log(actor.id, 'integration.created', 'IntegrationChannel', c.id, { name: c.name, kind: c.kind });
    return mask(c);
  }

  @RequirePermissions('integrations:manage')
  @Patch('channels/:id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateChannelDto) {
    if (dto.events) this.assertEvents(dto.events);
    const c = await this.prisma.integrationChannel.update({ where: { id }, data: dto });
    const { webhookUrl, ...logged } = dto;
    await this.audit.log(actor.id, 'integration.updated', 'IntegrationChannel', id, { ...logged, webhookChanged: !!webhookUrl });
    return mask(c);
  }

  @RequirePermissions('integrations:manage')
  @Delete('channels/:id')
  async remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    await this.prisma.integrationChannel.delete({ where: { id } });
    await this.audit.log(actor.id, 'integration.deleted', 'IntegrationChannel', id);
    return { ok: true };
  }

  @RequirePermissions('integrations:manage')
  @Post('channels/:id/test')
  async test(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.integrationChannel.findUniqueOrThrow({ where: { id } });
    try {
      await this.integrations.send(c, 'test', {
        title: 'CloudGuardian test message',
        text: `Sent by ${actor.name}. This channel is connected.`,
        link: '/dashboard',
      });
      return { ok: true };
    } catch (err) {
      throw new BadRequestException(`Delivery failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private assertEvents(events: string[]) {
    const known = INTEGRATION_EVENTS.map((e) => e.key as string);
    const unknown = events.filter((e) => !known.includes(e));
    if (unknown.length) throw new BadRequestException(`Unknown events: ${unknown.join(', ')}`);
  }
}

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
