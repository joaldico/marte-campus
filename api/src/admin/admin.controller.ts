import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminRoleGuard } from '../auth/admin.guard';
import { SessionAuthGuard } from '../auth/session.guard';
import { SESSION_COOKIE } from '../auth/session-cookie';
import {
  AdminChapterDto,
  AdminCourseDetailDto,
  AdminCourseDto,
  AdminCourseListItemDto,
  CreateAdminChapterDto,
  CreateAdminCourseDto,
  PatchAdminChapterDto,
  PatchAdminCourseDto,
  ReorderAdminChaptersDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(SessionAuthGuard, AdminRoleGuard)
@ApiCookieAuth(SESSION_COOKIE)
@ApiUnauthorizedResponse()
@ApiForbiddenResponse({ description: 'FORBIDDEN — role is not admin' })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('courses')
  @ApiOperation({
    summary: 'List all courses with working-version chapterCount',
  })
  @ApiOkResponse({ type: AdminCourseListItemDto, isArray: true })
  list() {
    return this.admin.listCourses();
  }

  @Post('courses')
  @ApiOperation({ summary: 'Create a draft course with an empty working version' })
  @ApiBody({ type: CreateAdminCourseDto })
  @ApiCreatedResponse({ type: AdminCourseDto })
  create(@Body() body: CreateAdminCourseDto) {
    return this.admin.createCourse(body.title);
  }

  @Get('courses/:id')
  @ApiOperation({
    summary:
      'Course metadata, version summary, and working chapters in position order',
  })
  @ApiParam({ name: 'id', example: 'paisajes-iii' })
  @ApiOkResponse({ type: AdminCourseDetailDto })
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND' })
  getById(@Param('id') id: string) {
    return this.admin.getCourse(id);
  }

  @Patch('courses/:id')
  @ApiOperation({ summary: 'Patch course title metadata' })
  @ApiParam({ name: 'id', example: 'paisajes-iii' })
  @ApiBody({ type: PatchAdminCourseDto })
  @ApiOkResponse({ type: AdminCourseDto })
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND' })
  patch(@Param('id') id: string, @Body() body: PatchAdminCourseDto) {
    return this.admin.patchCourse(id, body.title);
  }

  @Post('courses/:id/chapters')
  @ApiOperation({
    summary:
      'Append a chapter to the working version; reuse Video by url or create one',
  })
  @ApiParam({ name: 'id', example: 'paisajes-iii' })
  @ApiBody({ type: CreateAdminChapterDto })
  @ApiCreatedResponse({ type: AdminChapterDto })
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CHAPTER_ON_PUBLISHED' })
  addChapter(
    @Param('id') id: string,
    @Body() body: CreateAdminChapterDto,
  ) {
    return this.admin.addChapter(id, body.title, body.url);
  }

  @Patch('courses/:id/chapters/order')
  @ApiOperation({
    summary: 'Rewrite working-version chapter positions 1..n',
  })
  @ApiParam({ name: 'id', example: 'paisajes-iii' })
  @ApiBody({ type: ReorderAdminChaptersDto })
  @ApiOkResponse({ type: AdminCourseDetailDto })
  @ApiBadRequestResponse({ description: 'CHAPTER_SET_MISMATCH' })
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CHAPTER_ON_PUBLISHED' })
  reorder(
    @Param('id') id: string,
    @Body() body: ReorderAdminChaptersDto,
  ) {
    return this.admin.reorderChapters(id, body.chapterIds);
  }

  @Patch('courses/:id/chapters/:cid')
  @ApiOperation({ summary: 'Patch a working-version chapter title and optional url' })
  @ApiParam({ name: 'id', example: 'paisajes-iii' })
  @ApiParam({ name: 'cid', example: 'uuid-chapter' })
  @ApiBody({ type: PatchAdminChapterDto })
  @ApiOkResponse({ type: AdminChapterDto })
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND or CHAPTER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CHAPTER_ON_PUBLISHED' })
  patchChapter(
    @Param('id') id: string,
    @Param('cid') cid: string,
    @Body() body: PatchAdminChapterDto,
  ) {
    return this.admin.patchChapter(id, cid, body.title, body.url);
  }

  @Delete('courses/:id/chapters/:cid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a working-version chapter' })
  @ApiParam({ name: 'id', example: 'paisajes-iii' })
  @ApiParam({ name: 'cid', example: 'uuid-chapter' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND or CHAPTER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CHAPTER_ON_PUBLISHED' })
  async deleteChapter(@Param('id') id: string, @Param('cid') cid: string) {
    await this.admin.deleteChapter(id, cid);
  }
}
