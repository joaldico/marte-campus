import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CookieRequest,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  readCookie,
} from './session-cookie';

export type PublicUser = {
  id: string;
  name: string;
  role: Role;
};

export type AuthedUser = PublicUser & { sessionId: string };

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { id: 'asc' },
    });
  }

  async login(userId: string | undefined): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    user: PublicUser;
  }> {
    if (!userId) {
      throw new HttpException(
        { code: 'USER_REQUIRED', message: 'userId is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpException(
        { code: 'USER_NOT_FOUND', message: 'Unknown user' },
        HttpStatus.NOT_FOUND,
      );
    }
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    return session;
  }

  async userFromRequest(req: CookieRequest): Promise<AuthedUser | null> {
    const sid = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!sid) {
      return null;
    }
    const session = await this.prisma.session.findUnique({
      where: { id: sid },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    if (!session) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session
        .delete({ where: { id: sid } })
        .catch(() => undefined);
      return null;
    }
    return {
      id: session.user.id,
      name: session.user.name,
      role: session.user.role,
      sessionId: session.id,
    };
  }

  async requireUser(req: CookieRequest): Promise<AuthedUser> {
    const user = await this.userFromRequest(req);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Not authenticated',
      });
    }
    return user;
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.delete({ where: { id: sessionId } });
  }
}
