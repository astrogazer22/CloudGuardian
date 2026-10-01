import { Priority, TicketType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsString() @MinLength(3) title: string;
  @IsString() description: string;
  @IsEnum(TicketType) type: TicketType;
  @IsEnum(Priority) priority: Priority;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @IsOptional() @IsString() requesterId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsArray() assetIds?: string[];
  @IsOptional() @IsString() catalogItemId?: string;
}

export class UpdateTicketDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() category?: string | null;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsString() teamId?: string | null;
  @IsOptional() @IsString() organizationId?: string | null;
  @IsOptional() @IsString() contactId?: string | null;
  @IsOptional() @IsString() parentId?: string | null;
}

export class TransitionDto {
  @IsString() transitionKey: string;
  @IsOptional() @IsString() comment?: string;
  /** Field values supplied alongside the transition (to satisfy requiredFields). */
  @IsOptional() @IsObject() fields?: { assigneeId?: string; category?: string; customFields?: Record<string, unknown> };
}

export class CommentDto {
  @IsString() @MinLength(1) body: string;
  @IsOptional() @IsBoolean() internal?: boolean;
}

export class LinkAssetDto {
  @IsString() assetId: string;
}

export class DecideApprovalDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() comment?: string;
}

export class ListTicketsQuery {
  @IsOptional() @IsIn(['all', 'open', 'mine', 'unassigned', 'breached', 'done']) view?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsEnum(TicketType) type?: TicketType;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() requesterId?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(['createdAt', 'updatedAt', 'priority', 'resolutionDueAt', 'number']) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class SlaPolicyDto {
  @IsEnum(Priority) priority: Priority;
  @IsInt() @Min(1) firstResponseMins: number;
  @IsInt() @Min(1) resolutionMins: number;
  @IsOptional() @IsBoolean() businessHours?: boolean;
  @IsOptional() @IsInt() @Min(0) warnBeforeMins?: number;
}

export class CalendarDto {
  @IsString() @MinLength(1) name: string;
  @IsString() timezone: string;
  @IsObject() hours: Record<string, [string, string][]>;
  @IsOptional() @IsArray() holidays?: string[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class EscalationPolicyDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @IsEnum(Priority, { each: true }) priorities?: Priority[];
  @IsArray() levels: {
    afterMins: number;
    notify?: string[];
    userIds?: string[];
    bumpPriority?: boolean;
    reassignToLead?: boolean;
  }[];
  @IsOptional() @IsInt() sortOrder?: number;
}

export class AutomationRuleDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @IsOptional() @IsObject() actions?: Record<string, unknown>;
  @IsOptional() @IsInt() sortOrder?: number;
}
