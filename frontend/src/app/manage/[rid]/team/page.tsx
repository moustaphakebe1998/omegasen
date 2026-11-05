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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { ROLE, type MemberRole } from "@/lib/labels";

type Member = Schemas["MemberOut"];
const ALL_ROLES: MemberRole[] = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"];

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

      <Card className="gap-0 overflow-hidden py-0">
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
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((m) => {
                const locked = m.role === "OWNER" && !isOwner;
                const busy = busyId === m.id;
                const self = m.user_id === user?.id;
                return (
                  <TableRow key={m.id} className={m.is_active ? undefined : "text-muted-foreground"}>
                    <TableCell className="font-medium">
                      {m.full_name}
                      {self && (
                        <Badge variant="secondary" className="ml-2">
                          Vous
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 truncate">{m.email}</TableCell>
                    <TableCell>
                      <Select
                        value={m.role}
                        disabled={locked || busy}
                        onValueChange={(v) =>
                          update(m, { role: v as MemberRole }, `${m.full_name} est maintenant ${ROLE[v as MemberRole].toLowerCase()}`)
                        }
                      >
                        <SelectTrigger size="sm" className="w-40" aria-label={`Rôle de ${m.full_name}`}>
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
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={m.is_active}
                        disabled={locked || busy}
                        aria-label={`${m.is_active ? "Désactiver" : "Activer"} ${m.full_name}`}
                        onCheckedChange={(v) =>
                          update(m, { is_active: v }, v ? `${m.full_name} est réactivé` : `${m.full_name} est désactivé`)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={locked || busy}
                        aria-label={`Retirer ${m.full_name}`}
                        onClick={() => setToRemove(m)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
