"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ExternalLink,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PAGE_SIZE, Pagination, SearchInput, useDebounced } from "@/components/admin/common";
import { AdminCreateRestaurantDialog } from "@/components/admin/create-restaurant-dialog";
import { RegenerateQrDialog, useSetRestaurantStatus } from "@/components/admin/restaurant-actions";
import {
  RESTAURANT_STATUS,
  RESTAURANT_STATUSES,
  type RestaurantStatus,
  RestaurantStatusSelect,
} from "@/components/admin/status";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type AdminRestaurant = Schemas["AdminRestaurant"];

export default function AdminRestaurantsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatusFilter] = useState<RestaurantStatus | "ALL">(() => {
    if (typeof window === "undefined") return "ALL";
    const s = new URLSearchParams(window.location.search).get("status");
    return s && (RESTAURANT_STATUSES as string[]).includes(s) ? (s as RestaurantStatus) : "ALL";
  });
  const search = useDebounced(q.trim());
  const [createOpen, setCreateOpen] = useState(false);
  const [qrFor, setQrFor] = useState<AdminRestaurant | null>(null);
  const setStatus = useSetRestaurantStatus();

  const list = useQuery({
    queryKey: ["admin", "restaurants", search, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/admin/restaurants", {
          params: {
            query: {
              q: search || undefined,
              status: status === "ALL" ? undefined : status,
              page,
              page_size: PAGE_SIZE,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const statusSelect = (x: AdminRestaurant, className?: string) => (
    <RestaurantStatusSelect
      name={x.name}
      value={x.status}
      pending={setStatus.isPending && setStatus.variables?.id === x.id}
      onChange={(status, reason) => setStatus.mutate({ id: x.id, status, reason })}
      className={className}
    />
  );

  const actions = (x: AdminRestaurant) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions pour ${x.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/restaurants/${x.id}`}>
            <Eye />
            Voir la fiche
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/manage/${x.id}`}>
            <Settings />
            Ouvrir l&apos;espace restaurateur
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/r/${x.slug}`} target="_blank">
            <ExternalLink />
            Page publique
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => setQrFor(x)}>
          <RefreshCw />
          Régénérer le QR Code
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <PageHeader
        title="Restaurants"
        description="Tous les restaurants de la plateforme."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Créer un restaurant
          </Button>
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Nom, slug, ville…"
          label="Rechercher un restaurant"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatusFilter(v as RestaurantStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filtrer par statut">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les statuts</SelectItem>
            {RESTAURANT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                <span className={cn("size-2 rounded-full", RESTAURANT_STATUS[s].dot)} aria-hidden />
                {RESTAURANT_STATUS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {list.isFetching && !list.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {list.isError ? (
        <p className="text-destructive">{errorMessage(list.error)}</p>
      ) : list.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Aucun restaurant"
          description={search ? "Aucun résultat pour cette recherche." : undefined}
        />
      ) : (
        <div className={cn(list.isPlaceholderData && "opacity-60")}>
          {/* Tablette / bureau : tableau */}
          <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead className="hidden lg:table-cell">Propriétaire(s)</TableHead>
                  <TableHead className="text-right">Commandes 30 j</TableHead>
                  <TableHead className="hidden xl:table-cell">QR Code</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data?.items.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="max-w-64">
                      <Link href={`/admin/restaurants/${x.id}`} className="block truncate font-medium hover:underline">
                        {x.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {[x.city, x.currency].filter(Boolean).join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell className="hidden max-w-56 lg:table-cell">
                      <span className="block truncate text-sm" title={x.owners.join(", ")}>
                        {x.owners.length ? x.owners.join(", ") : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-right">{x.orders_30d.toLocaleString("fr-FR")}</TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {x.qr_code ? (
                        <div className="flex items-center gap-2">
                          <code className="text-xs">{x.qr_code}</code>
                          <Badge variant={x.qr_active ? "secondary" : "outline"}>
                            {x.qr_active ? "Actif" : "Inactif"}
                          </Badge>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {statusSelect(x)}
                      {x.status === "ACTIVE" && !x.accepting_orders && (
                        <p className="mt-1 text-xs text-muted-foreground">Commandes fermées</p>
                      )}
                    </TableCell>
                    <TableCell>{actions(x)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile : cartes */}
          <ul className="space-y-3 md:hidden">
            {list.data?.items.map((x) => (
              <li key={x.id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300">
                    <Store className="size-5" aria-hidden />
                  </span>
                  <Link href={`/admin/restaurants/${x.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{x.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[x.city, x.currency, `${x.orders_30d.toLocaleString("fr-FR")} cmd / 30 j`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </Link>
                  {actions(x)}
                </div>
                <div className="flex items-center justify-between gap-3">
                  {statusSelect(x, "w-full max-w-48")}
                  <Link
                    href={`/admin/restaurants/${x.id}`}
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary"
                  >
                    Fiche <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}

      <RegenerateQrDialog restaurant={qrFor} onClose={() => setQrFor(null)} />
      <AdminCreateRestaurantDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
