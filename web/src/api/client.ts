export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  })
}

export async function apiJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await apiFetch(path, init)
  if (!res.ok) {
    throw new ApiError('La petición no se pudo completar.', res.status)
  }
  return (await res.json()) as T
}
