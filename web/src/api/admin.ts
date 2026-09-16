import { ApiError, apiFetch, apiJson } from './client'

export type CourseStatus = 'draft' | 'in_review' | 'published' | 'retired'

export type RevisionStatus = 'draft' | 'in_review' | 'published'

export type AdminCourseListItem = {
  id: string
  title: string
  status: CourseStatus
  chapterCount: number
}

export type AdminCourse = {
  id: string
  title: string
  status: CourseStatus
  workingVersionId: string | null
  publishedVersionId: string | null
}

export type AdminVersionSummary = {
  id: string
  revisionStatus: RevisionStatus
  versionNumber: number
}

export type AdminChapter = {
  id: string
  title: string
  videoId: string
  url: string
  position: number
}

export type AdminCourseDetail = AdminCourse & {
  versions: AdminVersionSummary[]
  chapters: AdminChapter[]
}

export function listAdminCourses(): Promise<AdminCourseListItem[]> {
  return apiJson<AdminCourseListItem[]>('/api/admin/courses')
}

export function createAdminCourse(title: string): Promise<AdminCourse> {
  return apiJson<AdminCourse>('/api/admin/courses', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function getAdminCourse(courseId: string): Promise<AdminCourseDetail> {
  return apiJson<AdminCourseDetail>(
    `/api/admin/courses/${encodeURIComponent(courseId)}`,
  )
}

export function transitionAdminCourse(
  courseId: string,
  to: CourseStatus,
): Promise<AdminCourse> {
  return apiJson<AdminCourse>(
    `/api/admin/courses/${encodeURIComponent(courseId)}/transition`,
    {
      method: 'POST',
      body: JSON.stringify({ to }),
    },
  )
}

export function addAdminChapter(
  courseId: string,
  title: string,
  url: string,
): Promise<AdminChapter> {
  return apiJson<AdminChapter>(
    `/api/admin/courses/${encodeURIComponent(courseId)}/chapters`,
    {
      method: 'POST',
      body: JSON.stringify({ title, url }),
    },
  )
}

export function reorderAdminChapters(
  courseId: string,
  chapterIds: string[],
): Promise<AdminCourseDetail> {
  return apiJson<AdminCourseDetail>(
    `/api/admin/courses/${encodeURIComponent(courseId)}/chapters/order`,
    {
      method: 'PATCH',
      body: JSON.stringify({ chapterIds }),
    },
  )
}

export function patchAdminChapter(
  courseId: string,
  chapterId: string,
  title: string,
  url?: string,
): Promise<AdminChapter> {
  const body: { title: string; url?: string } = { title }
  if (url !== undefined) {
    body.url = url
  }
  return apiJson<AdminChapter>(
    `/api/admin/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  )
}

export async function deleteAdminChapter(
  courseId: string,
  chapterId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/admin/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) {
    throw new ApiError('La petición no se pudo completar.', res.status)
  }
}

export function submitAdminRevision(courseId: string): Promise<AdminCourse> {
  return apiJson<AdminCourse>(
    `/api/admin/courses/${encodeURIComponent(courseId)}/revisions/submit`,
    { method: 'POST' },
  )
}

export function publishAdminRevision(courseId: string): Promise<AdminCourse> {
  return apiJson<AdminCourse>(
    `/api/admin/courses/${encodeURIComponent(courseId)}/revisions/publish`,
    { method: 'POST' },
  )
}
