"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  ChefHat,
  ExternalLink,
  LayoutDashboard,
  QrCode,
  Receipt,
  Settings,
  UtensilsCrossed,
  Users,
  Wallet,
  ScrollText,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { AppShell, type NavItem } from "@/components/shared/app-shell";
import { FullPageSpinner } from "@/components/shared/guards";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { CHANNEL, ROLE } from "@/lib/labels";
import type { Perm } from "@/lib/permissions";
import { type RealtimeEvent, useRestaurantSocket } from "@/lib/realtime";

import { type Order, useRestaurant } from "./hooks";
import { AccessDenied, useCan } from "./permissions";

/** Rubrique de navigation + permission requise (aucune = tout membre du restaurant). */
type ManageNavItem = NavItem & { perm?: Perm };

function manageNav(rid: string): ManageNavItem[] {
  return [
    { href: `/manage/${rid}`, label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
    { href: `/manage/${rid}/orders`, label: "Commandes", icon: Receipt, perm: "orders.history" },
    { href: `/manage/${rid}/reservations`, label: "Réservations", icon: CalendarDays, perm: "reservations.view" },
    { href: `/manage/${rid}/menu`, label: "Menu", icon: UtensilsCrossed, perm: "menu.view" },
    { href: `/manage/${rid}/qr`, label: "QR Code", icon: QrCode },
    { href: `/manage/${rid}/settings`, label: "Établissement", icon: Settings, perm: "restaurant.view" },
    { href: `/manage/${rid}/team`, label: "Équipe", icon: Users, perm: "team.view" },
    { href: `/manage/${rid}/stats`, label: "Statistiques", icon: BarChart3, perm: "stats.view" },
    { href: `/manage/${rid}/activity`, label: "Activité", icon: ScrollText, perm: "activity.view" },
  ];
}

/** Gabarit de l'espace gérant + abonnement temps réel unique pour toutes les pages. */
export function RestaurantShell({ rid, children }: { rid: string; children: React.ReactNode }) {
  const { roleIn, user } = useAuth();
  const queryClient = useQueryClient();
  const restaurant = useRestaurant(rid);
  const can = useCan(rid);
  const pathname = usePathname();

  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      if (e.event === "order.created") {
        const o = e.data as Partial<Order> | undefined;
        const channel = o?.channel ? ` · ${CHANNEL[o.channel]}` : "";
        toast(`Nouvelle commande n° ${o?.display_number ?? ""}${channel}`.trim());
        queryClient.invalidateQueries({ queryKey: ["orders", rid] });
      } else if (e.event === "order.updated") {
        queryClient.invalidateQueries({ queryKey: ["orders", rid] });
      } else if (e.event.startsWith("reservation.")) {
        queryClient.invalidateQueries({ queryKey: ["reservations", rid] });
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

  const allNav = useMemo(() => manageNav(rid), [rid]);
  const nav: NavItem[] = useMemo(() => allNav.filter((i) => !i.perm || can(i.perm)), [allNav, can]);
  // Accès direct à une rubrique sans la permission requise : état vide plutôt qu'une page en erreur.
  const section = allNav.find((i) => !i.exact && (pathname === i.href || pathname.startsWith(`${i.href}/`)));
  const denied = !!section?.perm && !can(section.perm);
  const canKitchen = can("orders.prepare");
  const canPos = can("orders.create");

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
      avatarUrl={r.logo_url}
      actions={
        <div className="hidden items-center gap-2 sm:flex">
          {canKitchen && (
            <Button asChild variant="outline" size="sm" title="Ouvrir l'écran cuisine">
              <a href={`/kitchen/${rid}`} target="_blank" rel="noopener noreferrer">
                <ChefHat />
                <span className="hidden md:inline">Cuisine</span>
                <span className="sr-only md:hidden">Cuisine (nouvel onglet)</span>
              </a>
            </Button>
          )}
          {canPos && (
            <Button asChild variant="outline" size="sm" title="Ouvrir la caisse">
              <a href={`/pos/${rid}`} target="_blank" rel="noopener noreferrer">
                <Wallet />
                <span className="hidden md:inline">Caisse</span>
                <span className="sr-only md:hidden">Caisse (nouvel onglet)</span>
              </a>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm" title="Voir la page publique">
            <a href={`/r/${r.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              <span className="hidden lg:inline">Page publique</span>
              <span className="sr-only lg:hidden">Page publique (nouvel onglet)</span>
            </a>
          </Button>
        </div>
      }
      sheetExtra={
        <div className="grid gap-2">
          <p className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Ouvrir</p>
          {[
            ...(canKitchen ? [{ href: `/kitchen/${rid}`, label: "Écran cuisine", icon: ChefHat }] : []),
            ...(canPos ? [{ href: `/pos/${rid}`, label: "Caisse", icon: Wallet }] : []),
            { href: `/r/${r.slug}`, label: "Page publique", icon: ExternalLink },
          ].map(({ href, label, icon: Icon }) => (
            <Button key={href} asChild variant="outline" className="justify-start">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Icon />
                {label}
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            </Button>
          ))}
        </div>
      }
    >
      <div className="[&_[data-slot=card]]:rounded-2xl">
        {denied ? <AccessDenied backHref={`/manage/${rid}`} /> : children}
      </div>
    </AppShell>
  );
}
