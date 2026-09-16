import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthedUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session.guard';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { CatalogCourseDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('courses')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary: 'Published courses with enrollment and progress if enrolled',
  })
  @ApiOkResponse({ type: CatalogCourseDto, isArray: true })
  @ApiUnauthorizedResponse()
  list(@CurrentUser() user: AuthedUser) {
    return this.catalog.listPublished(user.id);
  }
}
