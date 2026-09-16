import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthedUser } from './auth.service';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthedUser | undefined;
    if (!user || user.role !== Role.admin) {
      throw new HttpException(
        { code: 'FORBIDDEN', message: 'Admin role required' },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
