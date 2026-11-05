"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ActivationResult } from "@/components/admin/activation-link";
import { ConfirmDialog } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

import { type Catalog, type Member, teamErrorMessage, useInvalidateMembers } from "./team-data";

type UpdateArgs = { member: Member; body: Partial<Schemas["MemberUpdate"]>; success: string };

/** Mutations de l'équipe : chaque succès rafraîchit la liste et affiche un toast. */
export function useMemberMutations(rid: string, catalog: Catalog | undefined) {
  const invalidate = useInvalidateMembers(rid);
  const { user, reload } = useAuth();
  const afterChange = async (m: Member) => {
    await invalidate();
    if (m.user_id === user?.id) await reload().catch(() => undefined);
  };
  const onError = (e: unknown) => toast.error(teamErrorMessage(e, catalog));

  const update = useMutation({
    mutationFn: ({ member, body }: UpdateArgs) =>
      unwrap(
        api.PATCH("/api/restaurants/{restaurant_id}/members/{member_id}", {
          params: { path: { restaurant_id: rid, member_id: member.id } },
          body: { reset_permissions: false, ...body },
        }),
      ),
    onSuccess: async (_m, { member, success }) => {
      toast.success(success);
      await afterChange(member);
    },
    onError,
  });

  const resend = useMutation({
    mutationFn: (member: Member) =>
      unwrap(
        api.POST("/api/restaurants/{restaurant_id}/members/{member_id}/resend-invite", {
          params: { path: { restaurant_id: rid, member_id: member.id } },
        }),
      ),
    onSuccess: async (out) => {
      toast.success(out.email_sent ? `Invitation renvoyée à ${out.email}` : "Nouveau lien d'invitation créé");
      await invalidate();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (member: Member) =>
      unwrap(
        api.DELETE("/api/restaurants/{restaurant_id}/members/{member_id}", {
          params: { path: { restaurant_id: rid, member_id: member.id } },
        }),
      ),
    onSuccess: async (_d, member) => {
      toast.success(
        member.activated
          ? `${member.full_name} a été retiré·e de l'équipe`
          : `Invitation de ${member.full_name} annulée`,
      );
      await afterChange(member);
    },
    onError,
  });

  return { update, resend, remove };
}

export type MemberMutations = ReturnType<typeof useMemberMutations>;

/** Texte de confirmation du retrait, selon ce qu'il advient du compte. */
export function removeDescription(m: Member): React.ReactNode {
  if (!m.activated && m.editable_profile) {
    return (
      <>
        L&apos;invitation de <strong>{m.email}</strong> est annulée : le lien envoyé ne fonctionnera plus et le compte,
        jamais activé, est supprimé. Vous pourrez l&apos;inviter de nouveau plus tard.
      </>
    );
  }
  return (
    <>
      <strong>{m.full_name}</strong> perd immédiatement l&apos;accès à ce restaurant (caisse, cuisine, gestion). Son
      compte OmegaSen n&apos;est pas supprimé : il reste utilisable dans ses autres établissements et l&apos;historique
      de ses actions est conservé. Pour une simple suspension temporaire, préférez « Désactiver ».
    </>
  );
}

export type PendingAction = { kind: "remove" | "deactivate" | "reactivate"; member: Member } | null;

/** Dialogues de confirmation (retrait, désactivation, réactivation) et résultat du renvoi d'invitation. */
export function MemberActionDialogs({
  pending,
  setPending,
  resent,
  setResent,
  mutations,
  onRemoved,
}: {
  pending: PendingAction;
  setPending: (p: PendingAction) => void;
  resent: Member | null;
  setResent: (m: Member | null) => void;
  mutations: MemberMutations;
  onRemoved?: () => void;
}) {
  // Garde le dernier contenu affiché pendant l'animation de fermeture.
  const [shown, setShown] = useState<PendingAction>(pending);
  if (pending && pending !== shown) setShown(pending);
  const current = pending ?? shown;
  const m = current?.member;
  const kind = current?.kind ?? "remove";
  const busy = mutations.update.isPending || mutations.remove.isPending;

  const confirm = async () => {
    if (!m) return;
    try {
      if (kind === "remove") {
        await mutations.remove.mutateAsync(m);
        onRemoved?.();
      } else {
        const active = kind === "reactivate";
        await mutations.update.mutateAsync({
          member: m,
          body: { is_active: active },
          success: active ? `${m.full_name} est réactivé·e` : `${m.full_name} est désactivé·e`,
        });
      }
      setPending(null);
    } catch {
      /* toast déjà affiché */
    }
  };

  const invitation = m && !m.activated;
  const copy = {
    remove: {
      title: invitation ? `Annuler l'invitation de ${m?.full_name ?? ""} ?` : `Retirer ${m?.full_name ?? ""} de l'équipe ?`,
      label: invitation ? "Annuler l'invitation" : "Retirer de l'équipe",
      description: m ? removeDescription(m) : null,
    },
    deactivate: {
      title: `Désactiver ${m?.full_name ?? ""} ?`,
      label: "Désactiver",
      description:
        "Cette personne ne pourra plus accéder au restaurant tant qu'elle reste désactivée. Son rôle, ses permissions et son historique sont conservés : vous pourrez la réactiver à tout moment.",
    },
    reactivate: {
      title: `Réactiver ${m?.full_name ?? ""} ?`,
      label: "Réactiver",
      description: "Cette personne retrouvera immédiatement l'accès au restaurant, avec son rôle et ses permissions actuels.",
    },
  }[kind];

  return (
    <>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.label}
        destructive={kind !== "reactivate"}
        pending={busy}
        onConfirm={confirm}
      />
      <Dialog open={!!resent} onOpenChange={(o) => !o && setResent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation renvoyée</DialogTitle>
            <DialogDescription>
              Un nouveau lien a été créé pour {resent?.full_name} ; les liens précédents ne fonctionnent plus.
            </DialogDescription>
          </DialogHeader>
          {resent && <ActivationResult url={resent.activation_url} email={resent.email} emailSent={resent.email_sent} />}
          <DialogFooter>
            <Button onClick={() => setResent(null)}>Terminé</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
