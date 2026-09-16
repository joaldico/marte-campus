import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
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
import { readFileSync } from 'fs';
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
  ImportEventsFileDto,
  ImportEventsResponseDto,
  PatchAdminChapterDto,
  PatchAdminCourseDto,
  ReorderAdminChaptersDto,
  TransitionAdminCourseDto,
  VideoHeatmapDto,
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

  @Post('courses/:id/transition')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set course.status along spec 2.6 edges; illegal pairs and empty publish are 409',
  })
  @ApiParam({ name: 'id', example: 'paisajes-iii' })
  @ApiBody({ type: TransitionAdminCourseDto })
  @ApiOkResponse({ type: AdminCourseDto })
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'STATE_TRANSITION_FORBIDDEN or COURSE_EMPTY',
  })
  transition(
    @Param('id') id: string,
    @Body() body: TransitionAdminCourseDto,
  ) {
    return this.admin.transitionCourse(id, body.to);
  }

  @Post('courses/:id/chapters')
  @ApiOperation({
    summary:
      'Append a chapter to the working version (clones published working first); reuse Video by url or create one',
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
    summary:
      'Rewrite working-version chapter positions 1..n (clones published working first)',
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
  @ApiOperation({
    summary:
      'Patch a working-version chapter title and optional url (clones published working first)',
  })
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
  @ApiOperation({
    summary: 'Delete a working-version chapter (clones published working first)',
  })
  @ApiParam({ name: 'id', example: 'paisajes-iii' })
  @ApiParam({ name: 'cid', example: 'uuid-chapter' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND or CHAPTER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'CHAPTER_ON_PUBLISHED' })
  async deleteChapter(@Param('id') id: string, @Param('cid') cid: string) {
    await this.admin.deleteChapter(id, cid);
  }

  @Post('courses/:id/revisions/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Submit working draft revision for review; course.status stays published',
  })
  @ApiParam({ name: 'id', example: 'paisajes-i' })
  @ApiOkResponse({ type: AdminCourseDto })
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'STATE_TRANSITION_FORBIDDEN — working is not a draft clone',
  })
  submitRevision(@Param('id') id: string) {
    return this.admin.submitRevision(id);
  }

  @Post('courses/:id/revisions/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Publish in_review working revision as publishedVersionId; course.status stays published',
  })
  @ApiParam({ name: 'id', example: 'paisajes-i' })
  @ApiOkResponse({ type: AdminCourseDto })
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'STATE_TRANSITION_FORBIDDEN if working is not in_review; COURSE_EMPTY if 0 chapters',
  })
  publishRevision(@Param('id') id: string) {
    return this.admin.publishRevision(id);
  }

  @Post('events/import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Import spec 3.1 playback CSV (userId from file); persist every row via ingest(); do not abort on reject',
  })
  @ApiBody({ type: ImportEventsFileDto })
  @ApiOkResponse({ type: ImportEventsResponseDto })
  @ApiBadRequestResponse({ description: 'CSV_REQUIRED' })
  importEvents(
    @UploadedFile()
    file?: { buffer?: Buffer; path?: string },
  ) {
    const csv = csvText(file);
    return this.admin.importEvents(csv);
  }

  @Get('videos/:id/heatmap')
  @ApiOperation({
    summary:
      '1s heatmap buckets from accepted events; durationSeconds from Video',
  })
  @ApiParam({ name: 'id', example: 'cascada' })
  @ApiOkResponse({ type: VideoHeatmapDto })
  @ApiNotFoundResponse({ description: 'VIDEO_NOT_FOUND' })
  heatmap(@Param('id') id: string) {
    return this.admin.getVideoHeatmap(id);
  }
}

function csvText(file?: { buffer?: Buffer; path?: string }): string {
  if (file?.buffer && file.buffer.length > 0) {
    return file.buffer.toString('utf8');
  }
  if (file?.path) {
    return readFileSync(file.path, 'utf8');
  }
  throw new HttpException(
    { code: 'CSV_REQUIRED', message: 'CSV file required' },
    HttpStatus.BAD_REQUEST,
  );
}
