"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShoppingBasket, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { rememberOrder } from "@/components/public/recent-orders-store";
import { EmptyState, Logo } from "@/components/shared/app-shell";
import { ProductDialog } from "@/components/shared/product-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  api,
  errorMessage,
  unwrap,
  type Schemas,
} from "@/lib/api/client";
import {
  type CartLine,
  type Product,
  toOrderItems,
  useCart,
  validateOptions,
} from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CartPanel, type CartStep } from "./cart-panel";
import type { CheckoutValues } from "./checkout-form";
import { KioskConfirmation } from "./kiosk-confirmation";
import { Menu } from "./menu";
import { RestaurantHeader } from "./restaurant-header";

type Restaurant = Schemas["PublicRestaurant"];
export type PublicChannel = "QR" | "ONLINE" | "KIOSK";

const KIOSK_IDLE_MS = 120_000;

function visibleMenu(r: Restaurant) {
  return r.menu
    .filter((c) => c.is_visible)
    .map((c) => ({ ...c, products: c.products.filter((p) => p.is_visible) }))
    .filter((c) => c.products.length > 0);
}

function availableProducts(r: Restaurant): Map<string, Product> {
  const map = new Map<string, Product>();
  for (const c of visibleMenu(r))
    for (const p of c.products) if (p.is_available) map.set(p.id, p);
  return map;
}

/** Une ligne reste valide si le produit est disponible et ses options existent, sont disponibles et respectent min/max. */
function lineStillValid(line: CartLine, products: Map<string, Product>) {
  const p = products.get(line.productId);
  if (!p) return false;
  const options = new Map(
    p.option_groups.flatMap((g) => g.options).map((o) => [o.id, o]),
  );
  if (!line.optionIds.every((id) => options.get(id)?.is_available))
    return false;
  return validateOptions(p, line.optionIds) === null;
}

export function RestaurantView({
  slug,
  initialData,
  channel,
}: {
  slug: string;
  initialData?: Restaurant;
  channel: PublicChannel;
}) {
  const kiosk = channel === "KIOSK";
  const router = useRouter();
  const cart = useCart(`cart:${slug}`);

  const query = useQuery({
    queryKey: ["public-restaurant", slug],
    queryFn: () =>
      unwrap(
        api.GET("/api/public/restaurants/{slug}", {
          params: { path: { slug } },
        }),
      ),
    initialData,
    refetchInterval: 60_000,
  });
  const restaurant = query.data;

  const [selected, setSelected] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<CartStep>("cart");
  const [closedError, setClosedError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    Schemas["PlacedOrderOut"] | null
  >(null);

  const categories = useMemo(
    () => (restaurant ? visibleMenu(restaurant) : []),
    [restaurant],
  );

  // Retire du panier (restauré depuis la session) les produits devenus indisponibles.
  const { hydrated, syncWithMenu } = cart;
  useEffect(() => {
    if (restaurant && hydrated)
      syncWithMenu(new Set(availableProducts(restaurant).keys()));
  }, [restaurant, hydrated, syncWithMenu]);

  // Panier vidé → on revient à l'étape « panier ».
  useEffect(() => {
    if (cart.lines.length === 0) setStep("cart");
  }, [cart.lines.length]);

  const { clear: clearCart } = cart;
  const resetKiosk = useCallback(() => {
    clearCart();
    setDialogOpen(false);
    setSheetOpen(false);
    setStep("cart");
    setConfirmation(null);
    window.scrollTo({ top: 0 });
  }, [clearCart]);

  // Borne : retour automatique au menu après 2 minutes d'inactivité.
  useEffect(() => {
    if (!kiosk || confirmation) return;
    let timer = setTimeout(resetKiosk, KIOSK_IDLE_MS);
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(resetKiosk, KIOSK_IDLE_MS);
    };
    const events = [
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
      "scroll",
    ] as const;
    events.forEach((e) =>
      window.addEventListener(e, bump, { passive: true, capture: true }),
    );
    return () => {
      clearTimeout(timer);
      events.forEach((e) =>
        window.removeEventListener(e, bump, { capture: true }),
      );
    };
  }, [kiosk, confirmation, resetKiosk]);

  const order = useMutation({
    mutationFn: (v: CheckoutValues) =>
      unwrap(
        api.POST("/api/public/restaurants/{slug}/orders", {
          params: { path: { slug } },
          body: {
            channel,
            service_mode: v.service_mode,
            items: toOrderItems(cart.lines),
            customer_name: v.customer_name,
            customer_phone: kiosk ? null : v.customer_phone || null,
            table_label:
              v.service_mode === "DINE_IN" ? v.table_label || null : null,
            note: v.note || null,
            payment_preference: "AT_COUNTER",
            idempotency_key: cart.idempotencyKey,
          },
        }),
      ),
    onSuccess: (placed) => {
      cart.clear();
      setSheetOpen(false);
      setStep("cart");
      if (kiosk) {
        setConfirmation(placed);
        return;
      }
      rememberOrder({
        token: placed.tracking_token,
        displayNumber: placed.display_number,
        restaurantName: placed.restaurant_name,
        restaurantSlug: placed.restaurant_slug,
        createdAt: placed.created_at,
      });
      toast.success(`Commande n° ${placed.display_number} envoyée !`);
      router.push(`/track/${placed.tracking_token}`);
    },
    onError: async (e) => {
      toast.error(errorMessage(e));
      if (!(e instanceof ApiError)) return;
      if (e.code === "restaurant_closed") {
        setClosedError(e.message);
        query.refetch();
        return;
      }
      if (e.code === "service_mode_unavailable") {
        query.refetch();
        return;
      }
      if (e.code === "product_unavailable" || e.code === "invalid_options") {
        const res = await query.refetch();
        if (!res.data) return;
        const products = availableProducts(res.data);
        const invalid = cart.lines.filter((l) => !lineStillValid(l, products));
        cart.syncWithMenu(new Set(products.keys()));
        invalid.forEach((l) => cart.remove(l.key));
        setStep("cart");
        if (invalid.length > 0) {
          toast.info(
            "Votre panier a été mis à jour : certains articles ou options ne sont plus disponibles.",
          );
        }
      }
    },
  });

  if (!restaurant) {
    if (query.isError) {
      const notFound =
        query.error instanceof ApiError && query.error.status === 404;
      return (
        <main className="mx-auto flex min-h-dvh max-w-md items-center p-4">
          <EmptyState
            icon={Store}
            title={
              notFound
                ? "Restaurant introuvable"
                : "Impossible de charger le restaurant"
            }
            description={
              notFound
                ? "Ce restaurant n'existe pas ou n'est plus disponible."
                : errorMessage(query.error)
            }
            action={
              notFound ? (
                !kiosk && (
                  <Button asChild>
                    <Link href="/">Retour à l&apos;accueil</Link>
                  </Button>
                )
              ) : (
                <Button onClick={() => query.refetch()}>Réessayer</Button>
              )
            }
          />
        </main>
      );
    }
    return (
      <main
        className="mx-auto max-w-5xl space-y-4 p-4"
        aria-busy="true"
        aria-label="Chargement du restaurant"
      >
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </main>
    );
  }

  const modesAvailable =
    restaurant.dine_in_enabled || restaurant.takeaway_enabled;
  const closed = !restaurant.is_open_now;
  const blockedReason = closedError
    ? closedError
    : closed
      ? "Le restaurant est fermé : les commandes sont momentanément impossibles."
      : !restaurant.accepting_orders
        ? "Le restaurant ne prend pas de commandes pour le moment."
        : !modesAvailable
          ? "La commande en ligne n'est pas disponible pour ce restaurant."
          : null;
  const canOrder = blockedReason === null;

  const onAdd = (line: CartLine) => {
    cart.add(line);
    toast.success(
      `${line.quantity} × ${line.name} ajouté${line.quantity > 1 ? "s" : ""} au panier`,
    );
  };

  const panelProps = {
    restaurant,
    cart,
    step,
    onStepChange: setStep,
    kiosk,
    canOrder,
    blockedReason,
    pending: order.isPending,
    onSubmit: (v: CheckoutValues) => order.mutate(v),
  };
  const showBar = cart.count > 0;

  return (
    <div className={cn("min-h-dvh", kiosk && "select-none")}>
      <div
        className={cn(
          kiosk &&
            "md:grid md:grid-cols-[minmax(0,1fr)_380px] lg:grid-cols-[minmax(0,1fr)_440px]",
        )}
      >
        <div className="min-w-0">
          <RestaurantHeader restaurant={restaurant} kiosk={kiosk} />

          <main
            className={cn(
              "mx-auto w-full max-w-5xl px-4 pt-4",
              showBar ? "pb-28" : "pb-12",
              kiosk && "md:pb-12",
            )}
          >
            {blockedReason && (
              <div
                role="status"
                className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
              >
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">
                    {closed || closedError
                      ? "Le restaurant est fermé"
                      : "Le restaurant ne prend pas de commandes"}
                  </p>
                  <p>
                    {blockedReason.replace(/\.?$/, ".")} Vous pouvez tout de
                    même consulter le menu.
                  </p>
                </div>
              </div>
            )}

            <Menu
              categories={categories}
              currency={restaurant.currency}
              large={kiosk}
              onSelect={(p) => {
                setSelected(p);
                setDialogOpen(true);
              }}
            />

            {!kiosk && (
              <footer className="mt-12 flex flex-col items-center gap-2 border-t pt-6 text-xs text-muted-foreground">
                <span>Commande en ligne propulsée par</span>
                <Logo className="text-sm text-foreground" />
              </footer>
            )}
          </main>
        </div>

        {kiosk && (
          <aside
            aria-labelledby="kiosk-cart-title"
            className="sticky top-0 hidden h-dvh flex-col border-l bg-muted/30 md:flex"
          >
            <h2
              id="kiosk-cart-title"
              className="border-b bg-background px-5 py-4 text-2xl font-bold"
            >
              {step === "checkout" ? "Finaliser la commande" : "Votre commande"}
            </h2>
            <div className="flex-1 overflow-y-auto p-5">
              <CartPanel {...panelProps} />
            </div>
          </aside>
        )}
      </div>

      {showBar && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur",
            kiosk && "md:hidden",
          )}
        >
          <Button
            size="lg"
            className={cn(
              "mx-auto flex w-full max-w-lg justify-between gap-2",
              kiosk ? "h-16 text-lg" : "h-12",
            )}
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="flex items-center gap-2">
              <ShoppingBasket aria-hidden />
              Voir le panier
            </span>
            <span className="tabular truncate">
              {cart.count} article{cart.count > 1 ? "s" : ""} ·{" "}
              {formatMoney(cart.total, restaurant.currency)}
            </span>
          </Button>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] w-full gap-0 rounded-t-2xl sm:max-w-lg"
        >
          <SheetHeader className="border-b">
            <SheetTitle className={cn(kiosk && "text-2xl")}>
              {step === "checkout" ? "Finaliser la commande" : "Votre panier"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {step === "checkout"
                ? "Renseignez vos informations pour envoyer la commande."
                : "Modifiez les quantités ou supprimez des articles."}
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-4">
            <CartPanel {...panelProps} />
          </div>
        </SheetContent>
      </Sheet>

      <ProductDialog
        product={selected}
        currency={restaurant.currency}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={onAdd}
        large={kiosk}
      />

      {confirmation && (
        <KioskConfirmation
          order={confirmation}
          requirePrepayment={restaurant.require_prepayment}
          onDone={resetKiosk}
        />
      )}
    </div>
  );
}
