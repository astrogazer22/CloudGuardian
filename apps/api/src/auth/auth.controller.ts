import { Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Public } from './decorators';
import { AccessService } from './access.service';
import { AuthUser } from './permissions';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) password: string;
}

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private access: AccessService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log(user.id, 'auth.login', 'User', user.id);
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { token, user: await this.profile(user.id) };
  }

  @Get('me')
  me(@CurrentUser() authUser: AuthUser) {
    return this.profile(authUser.id);
  }

  @Post('change-password')
  async changePassword(@CurrentUser() authUser: AuthUser, @Body() dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    await this.audit.log(user.id, 'auth.password_changed', 'User', user.id);
    return { ok: true };
  }

  private async profile(userId: string) {
    const [auth, user] = await Promise.all([
      this.access.load(userId),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { teams: { include: { team: true } } } }),
    ]);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roleKey: auth!.roleKey,
      roleName: auth!.roleName,
      title: user.title,
      timezone: user.timezone,
      teams: user.teams.map((m) => ({ id: m.team.id, name: m.team.name })),
      permissions: auth!.permissions,
      ticketScope: auth!.ticketScope,
      inventoryEnvironments: auth!.inventoryEnvironments,
    };
  }
}
