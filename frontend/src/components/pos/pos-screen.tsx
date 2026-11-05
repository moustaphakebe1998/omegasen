"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, ClipboardList, Loader2, LogOut, Plus, Printer, ReceiptText, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { ProductDialog } from "@/components/shared/product-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api, ApiError, errorMessage, unwrap } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { buildLine, type Product, toOrderItems, useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { type RealtimeEvent, useRestaurantSocket } from "@/lib/realtime";
import { cn } from "@/lib/utils";

import { staffMenuQuery } from "../kitchen/stock-sheet";
import { type Order, useNow, useTransitionRules } from "../kitchen/orders";
import { OrdersSheet, printReceipt } from "./orders-sheet";
import { type PosPayment, PaymentDialog } from "./payment-dialog";
import { ProductGrid } from "./product-grid";
import { serviceModesFor, Ticket, type TicketDetails } from "./ticket";

const EMPTY_DETAILS: Omit<TicketDetails, "serviceMode"> = { customerName: "", tableLabel: "", note: "" };
const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function PosScreen({ rid }: { rid: string }) {
  const qc = useQueryClient();
  const { user, logout } = useAuth();
  const transitionRules = useTransitionRules(rid);
  const now = useNow(1000);
  const cart = useCart(null);

  const restaurant = useQuery({
    queryKey: ["restaurant", rid],
    queryFn: () => unwrap(api.GET("/api/restaurants/{restaurant_id}", { params: { path: { restaurant_id: rid } } })),
  });
  const menu = useQuery(staffMenuQuery(rid));
  const currency = restaurant.data?.currency ?? "XOF";
  const modes = serviceModesFor(restaurant.data);

  const [details, setDetails] = useState<TicketDetails | null>(null);
  const currentDetails: TicketDetails = details ?? { serviceMode: modes[0], ...EMPTY_DETAILS };

  const [picked, setPicked] = useState<Product | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ order: Order; change: number } | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);

  // ── Commandes en cours (temps réel) ──────────────────
  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      if (e.event === "menu.updated") {
        void qc.invalidateQueries({ queryKey: ["staff-menu", rid] });
        return;
      }
      if (e.event !== "order.created" && e.event !== "order.updated") return;
      void qc.invalidateQueries({ queryKey: ["pos-active", rid] });
      void qc.invalidateQueries({ queryKey: ["pos-awaiting", rid] });
      const o = e.data as Order | undefined;
      if (e.event === "order.updated" && o?.status === "READY") {
        toast.info(`Commande ${o.display_number} prête à remettre`, {
          action: { label: "Voir", onClick: () => setOrdersOpen(true) },
        });
      }
      if (e.event === "order.created" && o && !o.sent_to_kitchen_at) {
        toast.info(`Commande ${o.display_number} en attente de paiement`);
      }
    },
    [qc, rid],
  );
  const onReconnect = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["pos-active", rid] });
    void qc.invalidateQueries({ queryKey: ["pos-awaiting", rid] });
    void qc.invalidateQueries({ queryKey: ["staff-menu", rid] });
  }, [qc, rid]);
  const connection = useRestaurantSocket(rid, onEvent, onReconnect);
  const poll = connection === "open" ? false : 15_000;

  const active = useQuery({
    queryKey: ["pos-active", rid],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/orders/active", { params: { path: { restaurant_id: rid } } }),
      ),
    refetchInterval: poll,
  });
  const awaiting = useQuery({
    queryKey: ["pos-awaiting", rid],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/orders/awaiting-payment", {
          params: { path: { restaurant_id: rid } },
        }),
      ),
    refetchInterval: poll,
  });
  const readyCount = (active.data ?? []).filter((o) => o.status === "READY").length;
  const awaitingCount = awaiting.data?.length ?? 0;

  // ── Ticket ───────────────────────────────────────────
  const pick = (p: Product) => {
    if (!p.is_available) return;
    if (p.option_groups.length > 0) setPicked(p);
    else {
      cart.add(buildLine(p, [], 1, ""));
      toast.success(`${p.name} ajouté`, { duration: 1200 });
    }
  };

  const resetTicket = () => {
    cart.clear();
    setDetails(null);
    setTicketOpen(false);
  };

  const placeOrder = async (payment: PosPayment | null) => {
    setSubmitting(true);
    try {
      const d = currentDetails;
      const order = await unwrap(
        api.POST("/api/restaurants/{restaurant_id}/orders", {
          params: { path: { restaurant_id: rid } },
          body: {
            service_mode: d.serviceMode,
            items: toOrderItems(cart.lines),
            customer_name: orNull(d.customerName),
            table_label: d.serviceMode === "DINE_IN" ? orNull(d.tableLabel) : null,
            note: orNull(d.note),
            idempotency_key: cart.idempotencyKey,
            payment: payment ? { method: payment.method, amount_tendered: payment.amount_tendered ?? null } : null,
          },
        }),
      );
      const change =
        payment?.method === "CASH" && payment.amount_tendered ? Math.max(0, payment.amount_tendered - order.total) : 0;
      setPayOpen(false);
      setDone({ order, change });
      resetTicket();
      void qc.invalidateQueries({ queryKey: ["pos-active", rid] });
    } catch (e) {
      toast.error(errorMessage(e));
      if (e instanceof ApiError && e.status === 422) void qc.invalidateQueries({ queryKey: ["staff-menu", rid] });
    } finally {
      setSubmitting(false);
    }
  };

  const ticket = (idPrefix: string) => (
    <Ticket
      cart={cart}
      currency={currency}
      modes={modes}
      details={currentDetails}
      onDetails={setDetails}
      onCheckout={() => setPayOpen(true)}
      idPrefix={idPrefix}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-muted/40">
      <header className="flex flex-wrap items-center gap-3 border-b bg-background px-3 py-2">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "size-3 shrink-0 rounded-full",
              connection === "open" ? "bg-green-500" : connection === "connecting" ? "bg-amber-500" : "bg-red-500",
            )}
            role="status"
            aria-label={connection === "open" ? "Temps réel connecté" : "Temps réel déconnecté"}
          />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{restaurant.data?.name ?? "Caisse"}</h1>
            <p className="truncate text-xs text-muted-foreground">Caisse · {user?.full_name}</p>
          </div>
        </div>
        <p className="tabular hidden text-2xl font-bold sm:block" aria-label="Heure">
          {new Date(now).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <Button variant="outline" className="relative h-12 text-base" onClick={() => setOrdersOpen(true)}>
          <ClipboardList className="size-5" />
          Commandes
          {readyCount + awaitingCount > 0 && (
            <span
              className="tabular absolute -top-2 -right-2 flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground"
              aria-label={`${readyCount} prête(s), ${awaitingCount} en attente de paiement`}
            >
              {readyCount + awaitingCount}
            </span>
          )}
        </Button>
        <Button asChild variant="outline" className="h-12 text-base">
          <Link href={`/kitchen/${rid}`}>
            <ChefHat className="size-5" />
            <span className="hidden md:inline">Cuisine</span>
          </Link>
        </Button>
        <Button variant="ghost" className="size-12" aria-label="Se déconnecter" onClick={() => void logout()}>
          <LogOut className="size-5" />
        </Button>
      </header>

      {connection === "closed" && (
        <div role="status" className="flex items-center gap-2 bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black">
          <WifiOff className="size-4" aria-hidden />
          Connexion temps réel perdue — actualisation automatique toutes les 15 s.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1">
          {menu.isLoading || restaurant.isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground" role="status">
              <Loader2 className="size-5 animate-spin" /> Chargement du menu…
            </div>
          ) : menu.isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-destructive">{errorMessage(menu.error)}</p>
              <Button onClick={() => void menu.refetch()}>Réessayer</Button>
            </div>
          ) : (
            <ProductGrid categories={menu.data ?? []} currency={currency} onPick={pick} />
          )}
        </main>
        <aside className="hidden w-[380px] shrink-0 border-l bg-background lg:block xl:w-[420px]" aria-label="Ticket">
          {ticket("desk")}
        </aside>
      </div>

      {/* Barre ticket (tablette portrait / mobile) */}
      <div className="border-t bg-background p-3 lg:hidden">
        <Button className="h-14 w-full justify-between text-lg" onClick={() => setTicketOpen(true)}>
          <span className="flex items-center gap-2">
            <ReceiptText className="size-5" />
            Ticket ({cart.count})
          </span>
          <span className="tabular font-black">{formatMoney(cart.total, currency)}</span>
        </Button>
      </div>
      <Sheet open={ticketOpen} onOpenChange={setTicketOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Ticket en cours</SheetTitle>
          {ticket("mobile")}
        </SheetContent>
      </Sheet>

      <ProductDialog
        product={picked}
        currency={currency}
        open={picked !== null}
        onOpenChange={(o) => !o && setPicked(null)}
        onAdd={cart.add}
        large
      />

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        title="Encaissement"
        amountDue={cart.total}
        currency={currency}
        allowLater
        submitting={submitting}
        onSubmit={(p) => void placeOrder(p)}
      />

      <Dialog open={done !== null} onOpenChange={(o) => !o && setDone(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">Commande envoyée en cuisine</DialogTitle>
            <DialogDescription className="text-center">
              {done && (done.order.payment_status === "PAID" ? "Paiement enregistré." : "À encaisser plus tard.")}
            </DialogDescription>
          </DialogHeader>
          {done && (
            <div className="space-y-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Numéro de commande</p>
                <p className="tabular text-7xl font-black tracking-tight">{done.order.display_number}</p>
              </div>
              <p className="tabular text-lg">Total : {formatMoney(done.order.total, done.order.currency)}</p>
              {done.change > 0 && (
                <p className="rounded-xl bg-green-100 p-4 text-2xl font-black text-green-900 dark:bg-green-950 dark:text-green-100">
                  Monnaie à rendre : {formatMoney(done.change, done.order.currency)}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-14 text-base"
              onClick={() => done && printReceipt(rid, done.order.id)}
            >
              <Printer className="size-5" />
              Imprimer le ticket
            </Button>
            <Button className="h-14 text-base" onClick={() => setDone(null)} autoFocus>
              <Plus className="size-5" />
              Nouvelle commande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrdersSheet
        rid={rid}
        open={ordersOpen}
        onOpenChange={setOrdersOpen}
        rules={transitionRules}
        active={active}
        awaiting={awaiting}
        now={now}
      />
    </div>
  );
}
