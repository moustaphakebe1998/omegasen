"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Receipt, Search, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { type Order, useRestaurant } from "@/components/manage/layout/hooks";
import { OrderDetailSheet } from "@/components/manage/orders/order-detail-sheet";
import { OrdersTable } from "@/components/manage/orders/orders-table";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import {
  CHANNEL,
  ORDER_STATUS,
  PAYMENT_STATUS,
  type OrderChannel,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const ALL = "all";
const STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[];

export default function OrdersPage() {
  const { rid } = useParams<{ rid: string }>();
  const { data: restaurant } = useRestaurant(rid);
  const currency = restaurant?.currency ?? "EUR";

  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [channel, setChannel] = useState<OrderChannel | typeof ALL>(ALL);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | typeof ALL>(ALL);
  const [day, setDay] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Order | null>(null);

  // Recherche différée pour ne pas interroger l'API à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = {
    status: statuses.length ? statuses : null,
    channel: channel === ALL ? null : channel,
    payment_status: paymentStatus === ALL ? null : paymentStatus,
    day: day || null,
    q: q || null,
    page,
    page_size: PAGE_SIZE,
  };

  const query = useQuery({
    queryKey: ["orders", rid, "list", filters],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/orders", {
          params: { path: { restaurant_id: rid }, query: filters },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = statuses.length > 0 || channel !== ALL || paymentStatus !== ALL || !!day || !!q;

  const toggleStatus = (s: OrderStatus) => {
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
    setPage(1);
  };

  const reset = () => {
    setStatuses([]);
    setChannel(ALL);
    setPaymentStatus(ALL);
    setDay("");
    setSearch("");
    setQ("");
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Commandes" description="Historique complet, mis à jour en temps réel." />

      <Card className="mb-4 gap-4 rounded-2xl p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="col-span-2 space-y-1.5 lg:col-span-1">
            <Label htmlFor="f-q">Recherche</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="f-q"
                type="search"
                placeholder="N°, référence, client…"
                maxLength={40}
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-day">Date</Label>
            <Input
              id="f-day"
              type="date"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-channel">Canal</Label>
            <Select
              value={channel}
              onValueChange={(v) => {
                setChannel(v as OrderChannel | typeof ALL);
                setPage(1);
              }}
            >
              <SelectTrigger id="f-channel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les canaux</SelectItem>
                {(Object.keys(CHANNEL) as OrderChannel[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CHANNEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-pay">Paiement</Label>
            <Select
              value={paymentStatus}
              onValueChange={(v) => {
                setPaymentStatus(v as PaymentStatus | typeof ALL);
                setPage(1);
              }}
            >
              <SelectTrigger id="f-pay" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous</SelectItem>
                {(Object.keys(PAYMENT_STATUS) as PaymentStatus[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PAYMENT_STATUS[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filtrer par statut"
        >
          <span className="shrink-0 text-sm text-muted-foreground">Statut :</span>
          {STATUSES.map((s) => {
            const active = statuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => toggleStatus(s)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active ? cn("border-transparent", ORDER_STATUS[s].className) : "text-muted-foreground hover:bg-muted",
                )}
              >
                {ORDER_STATUS[s].label}
              </button>
            );
          })}
          {hasFilters && (
            <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={reset}>
              <X />
              Réinitialiser
            </Button>
          )}
        </div>
      </Card>

      <Card className="gap-0 overflow-hidden rounded-2xl py-0">
        {query.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">{errorMessage(query.error)}</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : query.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Receipt}
              title={hasFilters ? "Aucune commande ne correspond aux filtres" : "Aucune commande pour le moment"}
              description={hasFilters ? undefined : "Les commandes passées via le QR Code ou la caisse apparaîtront ici."}
            />
          </div>
        ) : (
          <div className={cn(query.isPlaceholderData && "opacity-60 transition-opacity")}>
            <OrdersTable orders={query.data.items} currency={currency} onSelect={setSelected} showDate={!day} />
          </div>
        )}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <span className="text-muted-foreground" aria-live="polite">
              {total} commande{total > 1 ? "s" : ""} · page {page} / {pages}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Suivant
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <OrderDetailSheet
        rid={rid}
        order={selected}
        currency={currency}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </>
  );
}
