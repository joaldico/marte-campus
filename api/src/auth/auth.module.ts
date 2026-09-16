import { Module } from '@nestjs/common';
import { AdminRoleGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionAuthGuard, AdminRoleGuard],
  exports: [AuthService, SessionAuthGuard, AdminRoleGuard],
})
export class AuthModule {}
