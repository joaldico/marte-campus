import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { SessionAuthGuard } from '../auth/session.guard';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get(':id/stream')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary:
      'Range-proxy the Video origin when VIDEO_PROXY=true; otherwise 302 to origin',
  })
  @ApiParam({ name: 'id', example: 'playa' })
  @ApiProduces('video/mp4')
  @ApiOkResponse({ description: 'Origin 200 body piped through' })
  @ApiResponse({ status: 206, description: 'Partial content from origin Range' })
  @ApiFoundResponse({ description: '302 to origin when VIDEO_PROXY is not true' })
  @ApiUnauthorizedResponse()
  @ApiNotFoundResponse({ description: 'VIDEO_NOT_FOUND' })
  @ApiResponse({
    status: 502,
    description: 'VIDEO_ORIGIN_ERROR — origin fetch failed or timed out',
  })
  stream(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const range = req.headers.range;
    const rangeHeader = Array.isArray(range) ? range[0] : range;
    return this.videos.stream(id, rangeHeader, req, res);
  }
}
