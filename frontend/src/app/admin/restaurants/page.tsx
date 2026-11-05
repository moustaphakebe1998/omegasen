"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, MoreHorizontal, Pause, Play, Plus, RefreshCw, Settings, Store } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { AdminCreateRestaurantDialog } from "@/components/admin/create-restaurant-dialog";
import { PAGE_SIZE, Pagination, SearchInput, useDebounced } from "@/components/admin/common";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api/client";

type AdminRestaurant = Schemas["AdminRestaurant"];
type Pending = { kind: "status" | "qr"; restaurant: AdminRestaurant } | null;

export default function AdminRestaurantsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [understood, setUnderstood] = useState(false);

  const list = useQuery({
    queryKey: ["admin", "restaurants", search, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/admin/restaurants", {
          params: {
            query: { q: search || undefined, page, page_size: PAGE_SIZE },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const setStatus = useMutation({
    mutationFn: (r: AdminRestaurant) =>
      unwrap(
        api.POST("/api/admin/restaurants/{restaurant_id}/status", {
          params: { path: { restaurant_id: r.id } },
          body: { status: r.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" },
        }),
      ),
    onSuccess: (r) => {
      toast.success(r.status === "ACTIVE" ? `${r.name} réactivé` : `${r.name} suspendu`);
      void qc.invalidateQueries({ queryKey: ["admin"] });
      setPending(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const regenerate = useMutation({
    mutationFn: (r: AdminRestaurant) =>
      unwrap(
        api.POST("/api/admin/restaurants/{restaurant_id}/qr/regenerate", {
          params: { path: { restaurant_id: r.id } },
        }),
      ),
    onSuccess: (qr, r) => {
      toast.success(`Nouveau QR Code généré pour ${r.name} (${qr.code})`);
      void qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      setPending(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const ask = (kind: "status" | "qr", restaurant: AdminRestaurant) => {
    setUnderstood(false);
    setPending({ kind, restaurant });
  };

  const busy = setStatus.isPending || regenerate.isPending;
  const r = pending?.restaurant;

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
        {list.isFetching && !list.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {list.isError ? (
        <p className="text-destructive">{errorMessage(list.error)}</p>
      ) : list.isLoading ? (
        <Skeleton className="h-64" />
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Aucun restaurant"
          description={search ? "Aucun résultat pour cette recherche." : undefined}
        />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Devise</TableHead>
                <TableHead>Propriétaire(s)</TableHead>
                <TableHead className="text-right">Commandes 30 j</TableHead>
                <TableHead>QR Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((x) => (
                <TableRow key={x.id}>
                  <TableCell>
                    <div className="font-medium">{x.name}</div>
                    <Link
                      href={`/r/${x.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                    >
                      /r/{x.slug}
                      <ExternalLink className="size-3" />
                    </Link>
                  </TableCell>
                  <TableCell>{x.city ?? "—"}</TableCell>
                  <TableCell>{x.currency}</TableCell>
                  <TableCell className="max-w-56">
                    <span className="block truncate text-sm" title={x.owners.join(", ")}>
                      {x.owners.length ? x.owners.join(", ") : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right">{x.orders_30d.toLocaleString("fr-FR")}</TableCell>
                  <TableCell>
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
                    {x.status === "ACTIVE" ? (
                      <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                        Actif
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Suspendu</Badge>
                    )}
                    {x.status === "ACTIVE" && !x.accepting_orders && (
                      <p className="mt-1 text-xs text-muted-foreground">Commandes fermées</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions pour ${x.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/manage/${x.id}`}>
                            <Settings />
                            Gérer le restaurant
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => ask("status", x)}>
                          {x.status === "ACTIVE" ? <Pause /> : <Play />}
                          {x.status === "ACTIVE" ? "Suspendre" : "Réactiver"}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => ask("qr", x)}>
                          <RefreshCw />
                          Régénérer le QR Code
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          {pending?.kind === "status" && r && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {r.status === "ACTIVE" ? `Suspendre ${r.name} ?` : `Réactiver ${r.name} ?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {r.status === "ACTIVE"
                    ? "Le restaurant ne sera plus visible et ne pourra plus recevoir de commandes."
                    : "Le restaurant redeviendra visible et pourra de nouveau recevoir des commandes."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
                <Button
                  variant={r.status === "ACTIVE" ? "destructive" : "default"}
                  disabled={busy}
                  onClick={() => setStatus.mutate(r)}
                >
                  {setStatus.isPending && <Loader2 className="animate-spin" />}
                  {r.status === "ACTIVE" ? "Suspendre" : "Réactiver"}
                </Button>
              </AlertDialogFooter>
            </>
          )}
          {pending?.kind === "qr" && r && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Régénérer le QR Code de {r.name} ?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>
                      Un nouveau code sera créé et <strong>l&apos;ancien cessera immédiatement de fonctionner</strong> :
                      tous les QR Codes déjà imprimés (tables, vitrine, flyers) ne mèneront plus au restaurant.
                    </p>
                    <p>
                      Le restaurateur devra réimprimer et remplacer tous ses supports. Cette action est irréversible.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <Checkbox id="qr-understood" checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} />
                <Label htmlFor="qr-understood" className="text-sm leading-snug font-normal">
                  Je comprends que les QR Codes imprimés de ce restaurant ne fonctionneront plus.
                </Label>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
                <Button variant="destructive" disabled={!understood || busy} onClick={() => regenerate.mutate(r)}>
                  {regenerate.isPending && <Loader2 className="animate-spin" />}
                  Régénérer le QR Code
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <AdminCreateRestaurantDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
