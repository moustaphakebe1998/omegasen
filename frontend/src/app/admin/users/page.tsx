"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PAGE_SIZE, Pagination, SearchInput, useDebounced } from "@/components/admin/common";
import { CreateUserDialog, useAdminRestaurants } from "@/components/admin/create-user-dialog";
import { InitialsAvatar, roleLabel, type UserStatus, UserStatusBadge } from "@/components/admin/status";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type AdminUser = Schemas["AdminUser"];
type AccountType = Schemas["AccountType"];

const ALL = "ALL";

const STATUS_FILTERS: { value: UserStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: "Tous" },
  { value: "PENDING", label: "En attente d'activation" },
  { value: "ACTIVE", label: "Actifs" },
  { value: "DISABLED", label: "Désactivés" },
];

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<UserStatus | typeof ALL>(ALL);
  const [type, setType] = useState<AccountType | typeof ALL>(ALL);
  const [restaurant, setRestaurant] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const search = useDebounced(q.trim());
  const restaurants = useAdminRestaurants();

  const list = useQuery({
    queryKey: ["admin", "users", search, status, type, restaurant, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/admin/users", {
          params: {
            query: {
              q: search || undefined,
              status: status === ALL ? undefined : status,
              account_type: type === ALL ? undefined : type,
              restaurant_id: restaurant === ALL ? undefined : restaurant,
              page,
              page_size: PAGE_SIZE,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const filtered = !!search || status !== ALL || type !== ALL || restaurant !== ALL;
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Comptes de la plateforme : création, activation, rattachement aux restaurants et droits."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            Créer un utilisateur
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={reset(setQ)} placeholder="Email ou nom…" label="Rechercher un utilisateur" />
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Select value={type} onValueChange={(v) => reset(setType)(v as AccountType | typeof ALL)}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Type de compte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les comptes</SelectItem>
                <SelectItem value="STAFF">Personnel</SelectItem>
                <SelectItem value="CUSTOMER">Clients</SelectItem>
              </SelectContent>
            </Select>
            <Select value={restaurant} onValueChange={reset(setRestaurant)}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Restaurant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les restaurants</SelectItem>
                {restaurants.data?.items.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {list.isFetching && !list.isLoading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Chargement" />
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer par statut">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={status === f.value}
              onClick={() => reset(setStatus)(f.value)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                status === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.isError ? (
        <p className="text-destructive">{errorMessage(list.error)}</p>
      ) : list.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement des utilisateurs">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur"
          description={filtered ? "Aucun résultat pour ces filtres." : undefined}
        />
      ) : (
        <ul className={cn("space-y-3", list.isPlaceholderData && "opacity-60")} aria-label="Utilisateurs">
          {list.data?.items.map((u) => (
            <UserRow key={u.id} user={u} self={u.id === me?.id} />
          ))}
        </ul>
      )}
      {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function UserRow({ user: u, self }: { user: AdminUser; self: boolean }) {
  return (
    <li>
      <Link
        href={`/admin/users/${u.id}`}
        className={cn(
          "flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:items-center sm:gap-4",
          !u.is_active && "opacity-70",
        )}
        aria-label={`${u.full_name} (${u.email})`}
      >
        <InitialsAvatar name={u.full_name} />
        <div className="min-w-0 flex-1 space-y-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem] lg:items-center lg:gap-4 lg:space-y-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate font-semibold">{u.full_name}</span>
              {self && <Badge variant="secondary">Vous</Badge>}
            </div>
            <p className="truncate text-sm text-muted-foreground">{u.email}</p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            <UserStatusBadge status={u.status} />
            {u.is_superadmin && (
              <Badge className="border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                <ShieldCheck aria-hidden />
                Super admin
              </Badge>
            )}
            {u.account_type === "CUSTOMER" && <Badge variant="outline">Client</Badge>}
            {u.memberships.map((m) => (
              <Badge
                key={m.id}
                variant="outline"
                className={cn("max-w-full truncate", !m.is_active && "text-muted-foreground line-through")}
                title={`${m.restaurant_name} · ${roleLabel(m.role)}${m.is_active ? "" : " (suspendu)"}`}
              >
                <span className="truncate">
                  {m.restaurant_name} · {roleLabel(m.role)}
                </span>
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground lg:text-right">
            {u.last_login_at ? `Connecté le ${formatDateTime(u.last_login_at)}` : "Jamais connecté"}
          </p>
        </div>
        <ChevronRight className="mt-2 size-5 shrink-0 text-muted-foreground sm:mt-0" aria-hidden />
      </Link>
    </li>
  );
}
