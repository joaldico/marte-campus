import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
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
import {
  CatalogCourseDetailDto,
  CatalogCourseDto,
  EnrollResponseDto,
} from './catalog.dto';
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

  @Get('courses/:id')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary:
      'Published version chapters with per-chapter progress and watched ranges',
  })
  @ApiParam({ name: 'id', example: 'paisajes-i' })
  @ApiOkResponse({ type: CatalogCourseDetailDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'NOT_ENROLLED' })
  @ApiNotFoundResponse({
    description: 'Unknown or not published (COURSE_NOT_FOUND)',
  })
  getById(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    return this.catalog.getPublishedById(user.id, id);
  }

  @Post('courses/:id/enroll')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary: 'Enroll the current user in a published course',
  })
  @ApiParam({ name: 'id', example: 'paisajes-i' })
  @ApiCreatedResponse({ type: EnrollResponseDto })
  @ApiUnauthorizedResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      'COURSE_RETIRED, COURSE_NOT_PUBLISHED, or ALREADY_ENROLLED',
  })
  enroll(@Param('id') id: string, @CurrentUser() user: AuthedUser) {
    return this.catalog.enroll(user.id, id);
  }
}
