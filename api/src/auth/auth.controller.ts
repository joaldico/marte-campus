import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, AuthedUser, PublicUser } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { SessionAuthGuard } from './session.guard';
import {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from './session-cookie';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('users')
  listUsers(): Promise<PublicUser[]> {
    return this.auth.listUsers();
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { userId?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const session = await this.auth.login(body?.userId);
    res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions(req));
    return session.user;
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthedUser): PublicUser {
    return { id: user.id, name: user.name, role: user.role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthedUser,
  ): Promise<{ ok: true }> {
    await this.auth.logout(user.sessionId);
    res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions(req));
    return { ok: true };
  }
}
