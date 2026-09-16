import { fetchMe, login, logout, type PublicUser } from '../api/auth'

export async function ensureSession(): Promise<PublicUser | null> {
  try {
    return await fetchMe()
  } catch {
    return null
  }
}

export async function loginAs(userId: string): Promise<PublicUser> {
  await login(userId)
  const user = await fetchMe()
  if (!user) {
    throw new Error('La sesión no quedó establecida.')
  }
  return user
}

export async function logoutSession(): Promise<void> {
  try {
    await logout()
  } catch {
    /* already signed out */
  }
}
