"use client";

import { Lock, ShieldX } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

import { EmptyState } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { can, membershipIn, type Perm } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** `can(perm)` pour l'utilisateur connecté dans ce restaurant (permissions effectives de /auth/me). */
export function useCan(rid: string) {
  const { user } = useAuth();
  return useCallback((...perms: Perm[]) => perms.every((p) => can(user, rid, p)), [user, rid]);
}

/** Adhésion de l'utilisateur connecté (rôle, permissions, poste de cuisine). */
export function useMembership(rid: string) {
  const { user } = useAuth();
  return membershipIn(user, rid);
}

/** État vide affiché lorsqu'une page n'est pas accessible avec les permissions actuelles. */
export function AccessDenied({
  backHref,
  description = "Vos permissions ne permettent pas d'afficher cette page. Demandez au propriétaire du restaurant si vous en avez besoin.",
}: {
  backHref?: string;
  description?: string;
}) {
  return (
    <div className="py-6">
      <EmptyState
        icon={ShieldX}
        title="Accès non autorisé"
        description={description}
        action={
          backHref ? (
            <Button asChild variant="outline">
              <Link href={backHref}>Retour à la vue d&apos;ensemble</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

/** Petit badge « Lecture seule » affiché sur une section non modifiable. */
export function ReadOnlyHint({ className, title }: { className?: string; title?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 font-normal text-muted-foreground", className)}
      title={title ?? "Vos permissions ne permettent pas de modifier cette section"}
    >
      <Lock className="size-3" aria-hidden />
      Lecture seule
    </Badge>
  );
}
