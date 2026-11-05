"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, refreshSession, setAccessToken, setOnSessionLost, unwrap, type Schemas } from "@/lib/api/client";

export type User = Schemas["UserOut"];
export type Role = Schemas["MemberRole"];

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Active un compte créé par un administrateur (lien à usage unique) et ouvre la session. */
  activate: (token: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Recharge l'utilisateur courant (`/api/auth/me`) et le retourne. */
  reload: () => Promise<User>;
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

  const activate = useCallback(async (token: string, password: string) => {
    const data = await unwrap(api.POST("/api/auth/activate", { body: { token, password } }));
    setAccessToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.POST("/api/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const reload = useCallback(async () => {
    const me = await unwrap(api.GET("/api/auth/me"));
    setUser(me);
    return me;
  }, []);

  const roleIn = useCallback(
    (restaurantId: string) => user?.memberships.find((m) => m.restaurant_id === restaurantId)?.role ?? null,
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, activate, logout, reload, roleIn }),
    [user, loading, login, activate, logout, reload, roleIn],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}

/** Page du changement de mot de passe obligatoire (première connexion d'un compte créé directement). */
export const PASSWORD_CHANGE_PATH = "/changer-mot-de-passe";

/** Page d'accueil par défaut selon le profil de l'utilisateur. */
export function homeFor(user: User): string {
  // Compte créé avec un mot de passe initial : changement obligatoire avant toute chose.
  if (user.must_change_password) return PASSWORD_CHANGE_PATH;
  if (user.account_type === "CUSTOMER" && !user.is_superadmin && user.memberships.length === 0) return "/compte";
  if (user.is_superadmin && user.memberships.length === 0) return "/admin";
  if (user.memberships.length === 1) {
    const m = user.memberships[0];
    if (m.role === "KITCHEN") return `/kitchen/${m.restaurant_id}`;
    if (m.role === "CASHIER") return `/pos/${m.restaurant_id}`;
    return `/manage/${m.restaurant_id}`;
  }
  return "/manage";
}
