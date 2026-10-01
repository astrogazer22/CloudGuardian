import { Controller, Get, Global, Injectable, Module, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { AuthUser } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async notify(userIds: (string | null | undefined)[], title: string, body?: string, link?: string, excludeUserId?: string) {
    const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== excludeUserId))];
    if (!ids.length) return;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, title, body, link })),
    });
  }
}

@Controller('notifications')
class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId: user.id, read: false } }),
    ]);
    return { items, unread };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    return { ok: true };
  }

  @Post(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id }, data: { read: true } });
    return { ok: true };
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
