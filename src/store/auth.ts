import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'CEO' | 'MANAGER' | 'KITCHEN' | 'KIOSK'
  restaurants: string[]
}

interface AuthStore {
  user: AuthUser | null
  setUser: (u: AuthUser | null) => void
  logout: () => void
}

export const useAuth = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    { name: 'omegasen-auth' }
  )
)
