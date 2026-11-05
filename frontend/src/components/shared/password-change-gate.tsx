"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { FullPageSpinner } from "@/components/shared/guards";
import { PASSWORD_CHANGE_PATH, useAuth } from "@/lib/auth";

const ALLOWED = new Set([PASSWORD_CHANGE_PATH, "/login"]);

/**
 * Changement de mot de passe obligatoire : tant que `must_change_password` est vrai (compte créé avec un mot
 * de passe initial), toute page autre que /changer-mot-de-passe et /login y redirige. L'API refuse de toute
 * façon les autres appels (403 `password_change_required`).
 */
export function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = !!user?.must_change_password && !ALLOWED.has(pathname);

  useEffect(() => {
    if (blocked) router.replace(PASSWORD_CHANGE_PATH);
  }, [blocked, router]);

  if (blocked) return <FullPageSpinner label="Redirection…" />;
  return <>{children}</>;
}
