"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AddMemberDialog } from "@/components/manage/team/add-member-dialog";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { ROLE, type MemberRole } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Member = Schemas["MemberOut"];
const ALL_ROLES: MemberRole[] = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"];

const ROLE_TONE: Record<MemberRole, string> = {
  OWNER: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  MANAGER: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  CASHIER: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  KITCHEN: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default function TeamPage() {
  const { rid } = useParams<{ rid: string }>();
  const { user, roleIn, reload } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = roleIn(rid) === "OWNER" || !!user?.is_superadmin;
  const grantable = isOwner ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "OWNER");

  const [addOpen, setAddOpen] = useState(false);
  const [toRemove, setToRemove] = useState<Member | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const key = ["members", rid];
  const members = useQuery({
    queryKey: key,
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}/members", { params: { path: { restaurant_id: rid } } })),
  });

  const replace = (m: Member) =>
    queryClient.setQueryData<Member[]>(key, (cur) => cur?.map((x) => (x.id === m.id ? m : x)));

  const update = async (m: Member, body: Schemas["MemberUpdate"], success: string) => {
    setBusyId(m.id);
    try {
      const updated = await unwrap(
        api.PATCH("/api/restaurants/{restaurant_id}/members/{member_id}", {
          params: { path: { restaurant_id: rid, member_id: m.id } },
          body,
        }),
      );
      replace(updated);
      toast.success(success);
      if (m.user_id === user?.id) await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (m: Member) => {
    setBusyId(m.id);
    try {
      await unwrap(
        api.DELETE("/api/restaurants/{restaurant_id}/members/{member_id}", {
          params: { path: { restaurant_id: rid, member_id: m.id } },
        }),
      );
      queryClient.setQueryData<Member[]>(key, (cur) => cur?.filter((x) => x.id !== m.id));
      toast.success(`${m.full_name} a été retiré de l'équipe`);
      if (m.user_id === user?.id) await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Équipe"
        description="Gérez les accès de votre personnel : gérants, caissiers et cuisine."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus />
            Ajouter un membre
          </Button>
        }
      />

      <Card className="gap-0 overflow-hidden rounded-2xl py-0">
        {members.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : members.isError ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">{errorMessage(members.error)}</p>
            <Button variant="outline" onClick={() => members.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : members.data.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Users} title="Aucun membre" />
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_11rem_5rem_2.5rem] gap-4 border-b bg-muted/40 px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid">
              <span>Membre</span>
              <span>Rôle</span>
              <span>Actif</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y">
              {members.data.map((m) => {
                const locked = m.role === "OWNER" && !isOwner;
                const busy = busyId === m.id;
                const self = m.user_id === user?.id;
                const switchId = `active-${m.id}`;
                return (
                  <li
                    key={m.id}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_11rem_5rem_2.5rem] md:px-5",
                      !m.is_active && "bg-muted/30 text-muted-foreground",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                          ROLE_TONE[m.role],
                          !m.is_active && "opacity-50",
                        )}
                      >
                        {initials(m.full_name)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium">
                          <span className="truncate">{m.full_name}</span>
                          {self && (
                            <Badge variant="secondary" className="shrink-0">
                              Vous
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                    <div className="order-last col-span-2 flex items-center justify-between gap-3 md:order-none md:col-span-1 md:block">
                      <Select
                        value={m.role}
                        disabled={locked || busy}
                        onValueChange={(v) =>
                          update(m, { role: v as MemberRole }, `${m.full_name} est maintenant ${ROLE[v as MemberRole].toLowerCase()}`)
                        }
                      >
                        <SelectTrigger size="sm" className="w-40 md:w-full" aria-label={`Rôle de ${m.full_name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(locked ? ALL_ROLES : grantable).map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 md:hidden">
                        <Switch
                          id={switchId}
                          checked={m.is_active}
                          disabled={locked || busy}
                          aria-label={`${m.is_active ? "Désactiver" : "Activer"} ${m.full_name}`}
                          onCheckedChange={(v) =>
                            update(m, { is_active: v }, v ? `${m.full_name} est réactivé` : `${m.full_name} est désactivé`)
                          }
                        />
                        <label htmlFor={switchId} className="text-xs text-muted-foreground">
                          Actif
                        </label>
                      </div>
                    </div>
                    <div className="hidden items-center md:flex">
                      <Switch
                        checked={m.is_active}
                        disabled={locked || busy}
                        aria-label={`${m.is_active ? "Désactiver" : "Activer"} ${m.full_name}`}
                        onCheckedChange={(v) =>
                          update(m, { is_active: v }, v ? `${m.full_name} est réactivé` : `${m.full_name} est désactivé`)
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="justify-self-end text-muted-foreground hover:text-destructive"
                      disabled={locked || busy}
                      aria-label={`Retirer ${m.full_name}`}
                      onClick={() => setToRemove(m)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Un membre désactivé ne peut plus accéder au restaurant mais reste dans l&apos;historique.
        {!isOwner && " Seul un propriétaire peut nommer ou modifier un propriétaire."}
      </p>

      <AddMemberDialog
        rid={rid}
        open={addOpen}
        onOpenChange={setAddOpen}
        grantableRoles={grantable}
        onAdded={(m) => queryClient.setQueryData<Member[]>(key, (cur) => (cur ? [...cur, m] : [m]))}
      />

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {toRemove?.full_name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette personne perdra immédiatement l&apos;accès à ce restaurant. Son compte OmegaSen est conservé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => toRemove && remove(toRemove)}>
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
