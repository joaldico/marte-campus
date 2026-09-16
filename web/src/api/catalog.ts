import { apiJson } from './client'

export type CatalogCourseProgress = {
  averageRatio: number
  completedCount: number
  totalCount: number
}

export type CatalogCourse = {
  id: string
  title: string
  enrolled: boolean
  progress: CatalogCourseProgress | null
}

export type CatalogChapter = {
  id: string
  title: string
  chapterProgress: {
    completed: boolean
  }
}

export type CatalogCourseDetail = {
  id: string
  title: string
  chapters: CatalogChapter[]
}

export function listCourses(): Promise<CatalogCourse[]> {
  return apiJson<CatalogCourse[]>('/api/catalog/courses')
}

export function enrollCourse(courseId: string): Promise<{ enrolled: true }> {
  return apiJson<{ enrolled: true }>(
    `/api/catalog/courses/${encodeURIComponent(courseId)}/enroll`,
    { method: 'POST' },
  )
}

export function getCourse(courseId: string): Promise<CatalogCourseDetail> {
  return apiJson<CatalogCourseDetail>(
    `/api/catalog/courses/${encodeURIComponent(courseId)}`,
  )
}
