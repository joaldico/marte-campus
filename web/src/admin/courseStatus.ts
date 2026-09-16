import type { CourseStatus } from '../api/admin'

const LEGAL_TARGET: Record<CourseStatus, CourseStatus | null> = {
  draft: 'in_review',
  in_review: 'published',
  published: 'retired',
  retired: null,
}

export function legalTransitionTarget(
  status: CourseStatus,
): CourseStatus | null {
  return LEGAL_TARGET[status]
}

export function statusLabel(status: CourseStatus): string {
  if (status === 'draft') {
    return 'Borrador'
  }
  if (status === 'in_review') {
    return 'En revisión'
  }
  if (status === 'published') {
    return 'Publicado'
  }
  return 'Retirado'
}

export function statusTagType(
  status: CourseStatus,
): 'default' | 'warning' | 'success' | 'error' {
  if (status === 'in_review') {
    return 'warning'
  }
  if (status === 'published') {
    return 'success'
  }
  if (status === 'retired') {
    return 'error'
  }
  return 'default'
}

export function transitionButtonLabel(to: CourseStatus): string {
  if (to === 'in_review') {
    return 'Enviar a revisión'
  }
  if (to === 'published') {
    return 'Publicar'
  }
  if (to === 'retired') {
    return 'Retirar'
  }
  return 'Cambiar estado'
}
