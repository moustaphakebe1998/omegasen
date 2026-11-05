"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PAGE_SIZE, Pagination, SearchInput, useDebounced } from "@/components/admin/common";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, api, errorMessage, type Schemas, unwrap } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

type AdminUser = Schemas["AdminUser"];
type Patch = Schemas["AdminUserUpdate"];

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const key = ["admin", "users", search, page] as const;

  const list = useQuery({
    queryKey: key,
    queryFn: () =>
      unwrap(api.GET("/api/admin/users", { params: { query: { q: search || undefined, page, page_size: PAGE_SIZE } } })),
    placeholderData: keepPreviousData,
  });

  const update = useMutation({
    mutationFn: ({ user, patch }: { user: AdminUser; patch: Patch }) =>
      unwrap(api.PATCH("/api/admin/users/{user_id}", { params: { path: { user_id: user.id } }, body: patch })),
    onMutate: async ({ user, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Schemas["Page_AdminUser_"]>(key);
      qc.setQueryData<Schemas["Page_AdminUser_"]>(key, (d) =>
        d
          ? {
              ...d,
              items: d.items.map((u) =>
                u.id === user.id
                  ? {
                      ...u,
                      is_active: patch.is_active ?? u.is_active,
                      is_superadmin: patch.is_superadmin ?? u.is_superadmin,
                    }
                  : u,
              ),
            }
          : d,
      );
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(
        e instanceof ApiError && e.code === "self_demotion"
          ? "Vous ne pouvez pas retirer vos propres droits ni désactiver votre compte."
          : errorMessage(e),
      );
    },
    onSuccess: (u, { patch }) => {
      if (patch.is_active !== undefined) toast.success(u.is_active ? `${u.email} réactivé` : `${u.email} désactivé`);
      else toast.success(u.is_superadmin ? `${u.email} est super admin` : `${u.email} n'est plus super admin`);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const pendingFor = (id: string) => update.isPending && update.variables?.user.id === id;

  return (
    <>
      <PageHeader title="Utilisateurs" description="Comptes de la plateforme : activation et droits super admin." />
      <div className="mb-4 flex items-center gap-3">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Email ou nom…"
          label="Rechercher un utilisateur"
        />
        {list.isFetching && !list.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {list.isError ? (
        <p className="text-destructive">{errorMessage(list.error)}</p>
      ) : list.isLoading ? (
        <Skeleton className="h-64" />
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState icon={Users} title="Aucun utilisateur" description={search ? "Aucun résultat pour cette recherche." : undefined} />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead className="text-right">Restaurants</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead>Inscription</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead>Super admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((u) => {
                const self = u.id === me?.id;
                const busy = pendingFor(u.id);
                return (
                  <TableRow key={u.id} className={u.is_active ? undefined : "opacity-60"}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {u.full_name}
                        {self && <Badge variant="secondary">Vous</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="tabular text-right">{u.restaurants}</TableCell>
                    <TableCell className="text-sm">{u.last_login_at ? formatDateTime(u.last_login_at) : "Jamais"}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(u.created_at)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={u.is_active}
                        disabled={busy || self}
                        onCheckedChange={(v) => update.mutate({ user: u, patch: { is_active: v } })}
                        aria-label={`Compte actif : ${u.email}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.is_superadmin}
                        disabled={busy || (self && u.is_superadmin)}
                        onCheckedChange={(v) => update.mutate({ user: u, patch: { is_superadmin: v } })}
                        aria-label={`Super admin : ${u.email}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
      <p className="mt-2 text-xs text-muted-foreground">
        Par sécurité, vous ne pouvez ni désactiver votre propre compte ni retirer vos propres droits super admin.
      </p>
    </>
  );
}
