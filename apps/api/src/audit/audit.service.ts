import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(actorId: string | null, action: string, entity: string, entityId?: string, data: Record<string, unknown> = {}) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entity, entityId, data: data as any },
    });
  }
}
