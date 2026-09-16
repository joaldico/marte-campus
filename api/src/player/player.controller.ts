import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthedUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session.guard';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { PlayerChapterDto } from './player.dto';
import { PlayerService } from './player.service';

@ApiTags('player')
@Controller('player')
export class PlayerController {
  constructor(private readonly player: PlayerService) {}

  @Get('chapters/:chapterId')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary:
      'Player payload for a published-course chapter: url, merged ranges, cursor, siblings',
  })
  @ApiParam({ name: 'chapterId', example: 'paisajes-i-ch-1' })
  @ApiOkResponse({ type: PlayerChapterDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'NOT_ENROLLED' })
  @ApiNotFoundResponse({
    description: 'Unknown or not published (COURSE_NOT_FOUND)',
  })
  getChapter(
    @Param('chapterId') chapterId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.player.getPublishedChapter(user.id, chapterId);
  }
}
