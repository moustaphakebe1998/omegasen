import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import type { AuthUser } from '@/types'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'fallback-secret-change-me')
const COOKIE_NAME = 'omegasen_token'

export async function signToken(payload: AuthUser): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN ?? '24h')
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as AuthUser
  } catch {
    return null
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null
    return verifyToken(token)
  } catch {
    return null
  }
}

export async function setAuthCookie(user: AuthUser): Promise<void> {
  const token = await signToken(user)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export function assertCanAccessRestaurant(user: AuthUser, restaurantId: string): void {
  if (user.role === 'CEO') return
  if (!user.restaurants?.includes(restaurantId)) {
    throw new Error('FORBIDDEN')
  }
}

export function hasPermission(user: AuthUser, permission: string): boolean {
  const permissions: Record<string, string[]> = {
    CEO: ['menu:write', 'menu:read', 'orders:write', 'orders:read', 'users:write', 'analytics:read'],
    MANAGER: ['menu:write', 'menu:read', 'orders:write', 'orders:read', 'analytics:read'],
    KITCHEN: ['orders:write', 'orders:read'],
    KIOSK: ['orders:write'],
  }
  return permissions[user.role]?.includes(permission) ?? false
}
