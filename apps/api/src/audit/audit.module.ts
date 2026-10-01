import { Controller, Get, Global, Module, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

@Controller('audit')
class AuditController {
  constructor(private prisma: PrismaService) {}

  @RequirePermissions('audit:read')
  @Get()
  list(@Query('entity') entity?: string, @Query('take') take = '100') {
    return this.prisma.auditLog.findMany({
      where: entity ? { entity } : undefined,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 100, 500),
    });
  }
}

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
