"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ChefHat,
  ExternalLink,
  LayoutDashboard,
  QrCode,
  Receipt,
  Settings,
  UtensilsCrossed,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { AppShell, type NavItem } from "@/components/shared/app-shell";
import { FullPageSpinner } from "@/components/shared/guards";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { CHANNEL, ROLE } from "@/lib/labels";
import { type RealtimeEvent, useRestaurantSocket } from "@/lib/realtime";

import { type Order, useRestaurant } from "./hooks";

/** Gabarit de l'espace gérant + abonnement temps réel unique pour toutes les pages. */
export function RestaurantShell({ rid, children }: { rid: string; children: React.ReactNode }) {
  const { roleIn, user } = useAuth();
  const queryClient = useQueryClient();
  const restaurant = useRestaurant(rid);

  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      if (e.event === "order.created") {
        const o = e.data as Partial<Order> | undefined;
        const channel = o?.channel ? ` · ${CHANNEL[o.channel]}` : "";
        toast(`Nouvelle commande n° ${o?.display_number ?? ""}${channel}`.trim());
        queryClient.invalidateQueries({ queryKey: ["orders", rid] });
      } else if (e.event === "order.updated") {
        queryClient.invalidateQueries({ queryKey: ["orders", rid] });
      } else if (e.event === "menu.updated") {
        queryClient.invalidateQueries({ queryKey: ["menu", rid] });
      }
    },
    [queryClient, rid],
  );
  const onReconnect = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["orders", rid] });
  }, [queryClient, rid]);
  useRestaurantSocket(rid, onEvent, onReconnect);

  const nav: NavItem[] = useMemo(
    () => [
      { href: `/manage/${rid}`, label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
      { href: `/manage/${rid}/orders`, label: "Commandes", icon: Receipt },
      { href: `/manage/${rid}/menu`, label: "Menu", icon: UtensilsCrossed },
      { href: `/manage/${rid}/qr`, label: "QR Code", icon: QrCode },
      { href: `/manage/${rid}/settings`, label: "Établissement", icon: Settings },
      { href: `/manage/${rid}/team`, label: "Équipe", icon: Users },
      { href: `/manage/${rid}/stats`, label: "Statistiques", icon: BarChart3 },
    ],
    [rid],
  );

  if (restaurant.isPending) return <FullPageSpinner />;
  if (restaurant.isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">{errorMessage(restaurant.error)}</p>
        <Button variant="outline" onClick={() => restaurant.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  const r = restaurant.data;
  const role = roleIn(rid);
  const subtitle = role ? ROLE[role] : user?.is_superadmin ? "Super admin" : undefined;

  return (
    <AppShell
      title={r.name}
      subtitle={subtitle}
      nav={nav}
      actions={
        <>
          <Button asChild variant="outline" size="sm" title="Ouvrir l'écran cuisine">
            <a href={`/kitchen/${rid}`} target="_blank" rel="noopener noreferrer">
              <ChefHat />
              <span className="hidden md:inline">Cuisine</span>
              <span className="sr-only md:hidden">Cuisine (nouvel onglet)</span>
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" title="Ouvrir la caisse">
            <a href={`/pos/${rid}`} target="_blank" rel="noopener noreferrer">
              <Wallet />
              <span className="hidden md:inline">Caisse</span>
              <span className="sr-only md:hidden">Caisse (nouvel onglet)</span>
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" title="Voir la page publique">
            <a href={`/r/${r.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              <span className="hidden lg:inline">Page publique</span>
              <span className="sr-only lg:hidden">Page publique (nouvel onglet)</span>
            </a>
          </Button>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
