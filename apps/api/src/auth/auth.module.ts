import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AuthController } from './auth.controller';
import { RolesController } from './roles.controller';

@Global()
@Module({
  controllers: [AuthController, RolesController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AuthModule {}
