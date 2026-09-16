import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedUser } from './auth.service';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
