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
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService, AuthedUser, PublicUser } from './auth.service';
import { LoginDto, LogoutResponseDto, PublicUserDto } from './auth.dto';
import { CurrentUser } from './current-user.decorator';
import { SessionAuthGuard } from './session.guard';
import {
  SESSION_COOKIE,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from './session-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('users')
  @ApiOperation({ summary: 'List demo users' })
  @ApiOkResponse({ type: PublicUserDto, isArray: true })
  listUsers(): Promise<PublicUser[]> {
    return this.auth.listUsers();
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create session cookie' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: PublicUserDto })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const session = await this.auth.login(body?.userId);
    res.cookie(SESSION_COOKIE, session.id, sessionCookieOptions(req));
    return session.user;
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: 'Current session user' })
  @ApiOkResponse({ type: PublicUserDto })
  @ApiUnauthorizedResponse()
  me(@CurrentUser() user: AuthedUser): PublicUser {
    return { id: user.id, name: user.name, role: user.role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: 'Clear session cookie' })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse()
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
