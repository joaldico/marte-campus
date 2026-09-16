import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthedUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session.guard';
import { SESSION_COOKIE } from '../auth/session-cookie';
import {
  PlaybackCursorBodyDto,
  PlaybackCursorResponseDto,
  PlaybackEventBodyDto,
  PlaybackEventResponseDto,
} from './playback.dto';
import { PlaybackService } from './playback.service';

@ApiTags('playback')
@Controller('playback')
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @Post('events')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary:
      'Ingest a playback interval for the session user; persists accepted and rejected rows',
  })
  @ApiBody({ type: PlaybackEventBodyDto })
  @ApiCreatedResponse({ type: PlaybackEventResponseDto })
  @ApiUnauthorizedResponse()
  ingest(
    @Body() body: PlaybackEventBodyDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.playback.ingestEvent(user.id, body);
  }

  @Patch('cursor')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary: 'Upsert resume cursor without creating a watched interval',
  })
  @ApiBody({ type: PlaybackCursorBodyDto })
  @ApiOkResponse({ type: PlaybackCursorResponseDto })
  @ApiUnauthorizedResponse()
  @ApiBadRequestResponse({
    description: 'INVALID_POSITION — positionSeconds must be a finite number >= 0',
  })
  @ApiNotFoundResponse({ description: 'VIDEO_NOT_FOUND' })
  cursor(
    @Body() body: PlaybackCursorBodyDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.playback.upsertCursor(user.id, body);
  }
}
