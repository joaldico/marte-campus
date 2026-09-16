import { ApiError, apiFetch, apiJson } from './client'

export type Role = 'admin' | 'student'

export type PublicUser = {
  id: string
  name: string
  role: Role
}

export function listUsers(): Promise<PublicUser[]> {
  return apiJson<PublicUser[]>('/api/auth/users')
}

export function login(userId: string): Promise<PublicUser> {
  return apiJson<PublicUser>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export async function fetchMe(): Promise<PublicUser | null> {
  const res = await apiFetch('/api/auth/me')
  if (res.status === 401) {
    return null
  }
  if (!res.ok) {
    throw new ApiError('No se pudo comprobar la sesión.', res.status)
  }
  return (await res.json()) as PublicUser
}

export function logout(): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>('/api/auth/logout', { method: 'POST' })
}
