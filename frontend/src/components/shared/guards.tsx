"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { type Role, useAuth } from "@/lib/auth";
import { can, type Perm } from "@/lib/permissions";

export function FullPageSpinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-3 text-muted-foreground" role="status">
      <Loader2 className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function Forbidden({ message = "Vous n'avez pas accès à cet espace." }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Accès refusé</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link href="/manage">Retour</Link>
      </Button>
    </div>
  );
}

/** Exige une session ; redirige vers /login?next=… sinon. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);
  if (loading || !user) return <FullPageSpinner />;
  return <>{children}</>;
}

/**
 * Exige un rôle dans le restaurant donné (le super admin passe toujours).
 * Le backend revérifie systématiquement : ce garde n'est qu'un confort d'interface.
 */
export function RequireRestaurantRole({
  restaurantId,
  roles,
  children,
}: {
  restaurantId: string;
  roles: Role[];
  children: React.ReactNode;
}) {
  const { user, roleIn } = useAuth();
  return (
    <RequireAuth>
      {user && (user.is_superadmin || (roleIn(restaurantId) && roles.includes(roleIn(restaurantId)!))) ? (
        children
      ) : (
        <Forbidden />
      )}
    </RequireAuth>
  );
}

/**
 * Exige une permission dans le restaurant donné (permissions effectives de l'adhésion ;
 * le super admin passe toujours). Confort d'interface : le backend revérifie chaque route.
 */
export function RequireRestaurantPerm({
  restaurantId,
  perm,
  message,
  children,
}: {
  restaurantId: string;
  perm: Perm;
  message?: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  return <RequireAuth>{can(user, restaurantId, perm) ? children : <Forbidden message={message} />}</RequireAuth>;
}

export function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <RequireAuth>{user?.is_superadmin ? children : <Forbidden />}</RequireAuth>;
}
