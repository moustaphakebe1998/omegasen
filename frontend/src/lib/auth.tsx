"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  api,
  refreshSession,
  setAccessToken,
  setOnSessionLost,
  unwrap,
  type Schemas,
} from "@/lib/api/client";

export type User = Schemas["UserOut"];
export type Role = Schemas["MemberRole"];

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; password: string; full_name: string; phone?: string }) => Promise<User>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  roleIn: (restaurantId: string) => Role | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    refreshSession()
      .then((data) => {
        if (!cancelled) setUser(data?.user ?? null);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOnSessionLost(() => {
      setAccessToken(null);
      setUser(null);
    });
    return () => setOnSessionLost(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await unwrap(api.POST("/api/auth/login", { body: { email, password } }));
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (body: { email: string; password: string; full_name: string; phone?: string }) => {
      const data = await unwrap(api.POST("/api/auth/register", { body }));
      setAccessToken(data.access_token);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.POST("/api/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const reload = useCallback(async () => {
    const me = await unwrap(api.GET("/api/auth/me"));
    setUser(me);
  }, []);

  const roleIn = useCallback(
    (restaurantId: string) =>
      user?.memberships.find((m) => m.restaurant_id === restaurantId)?.role ?? null,
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, register, logout, reload, roleIn }),
    [user, loading, login, register, logout, reload, roleIn],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}

/** Page d'accueil par défaut selon le profil de l'utilisateur. */
export function homeFor(user: User): string {
  if (user.is_superadmin && user.memberships.length === 0) return "/admin";
  if (user.memberships.length === 1) {
    const m = user.memberships[0];
    if (m.role === "KITCHEN") return `/kitchen/${m.restaurant_id}`;
    if (m.role === "CASHIER") return `/pos/${m.restaurant_id}`;
    return `/manage/${m.restaurant_id}`;
  }
  return "/manage";
}
