"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  FolderTree,
  ImageOff,
  Mail,
  MapPin,
  Phone,
  QrCode,
  ReceiptText,
  RefreshCw,
  Settings,
  Store,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { RegenerateQrDialog, useSetRestaurantStatus } from "@/components/admin/restaurant-actions";
import {
  adminErrorMessage,
  InitialsAvatar,
  KpiCard,
  RestaurantStatusBadge,
  RestaurantStatusSelect,
  roleLabel,
  UserStatusBadge,
} from "@/components/admin/status";
import { EmptyState } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, formatMoney } from "@/lib/format";

const nf = new Intl.NumberFormat("fr-FR");

export default function AdminRestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const setStatus = useSetRestaurantStatus();
  const [qrOpen, setQrOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["admin", "restaurants", "detail", id],
    queryFn: () =>
      unwrap(api.GET("/api/admin/restaurants/{restaurant_id}", { params: { path: { restaurant_id: id } } })),
    retry: false,
  });

  if (detail.isPending)
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement du restaurant">
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  if (detail.isError)
    return (
      <EmptyState
        icon={Store}
        title="Restaurant introuvable"
        description={adminErrorMessage(detail.error)}
        action={
          <Button asChild variant="outline">
            <Link href="/admin/restaurants">Retour aux restaurants</Link>
          </Button>
        }
      />
    );

  const r = detail.data;
  const infos = [
    { icon: UtensilsCrossed, label: "Cuisine", value: r.cuisine },
    { icon: MapPin, label: "Adresse", value: [r.address_line, r.city].filter(Boolean).join(", ") || null },
    { icon: Phone, label: "Téléphone", value: r.phone },
    { icon: Mail, label: "Email", value: r.email },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/restaurants">
          <ArrowLeft aria-hidden />
          Restaurants
        </Link>
      </Button>

      {/* En-tête : couverture et logo dans leurs propres blocs, le texte jamais sur l'image. */}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="aspect-[4/1] min-h-28 w-full bg-muted">
          {r.cover_url ? (
            <img src={r.cover_url} alt={`Photo de couverture de ${r.name}`} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-6" aria-hidden />
              <span className="sr-only">Pas de photo de couverture</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-background">
            {r.logo_url ? (
              <img src={r.logo_url} alt={`Logo de ${r.name}`} className="size-full object-cover" />
            ) : (
              <Store className="size-7 text-orange-600" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{r.name}</h1>
              <RestaurantStatusBadge status={r.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              /r/{r.slug} · {r.currency} · créé le {formatDateTime(r.created_at)}
            </p>
            {r.status === "ACTIVE" && !r.accepting_orders && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Commandes en ligne fermées par le restaurant
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <RestaurantStatusSelect
              name={r.name}
              value={r.status}
              pending={setStatus.isPending}
              onChange={(status) => setStatus.mutate({ id: r.id, status })}
              className="w-full sm:w-48"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t px-5 py-3">
          <Button asChild>
            <Link href={`/manage/${r.id}`}>
              <Settings aria-hidden />
              Ouvrir l&apos;espace restaurateur
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/r/${r.slug}`} target="_blank">
              <ExternalLink aria-hidden />
              Page publique
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard
          label="Produits"
          value={nf.format(r.products)}
          icon={UtensilsCrossed}
          tone="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300"
        />
        <KpiCard
          label="Catégories"
          value={nf.format(r.categories)}
          icon={FolderTree}
          tone="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
        />
        <KpiCard
          label="Commandes 30 j"
          value={nf.format(r.orders_30d)}
          icon={ReceiptText}
          tone="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
        />
        <KpiCard
          label="CA TTC 30 j"
          value={formatMoney(r.revenue_30d, r.currency)}
          icon={Banknote}
          tone="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300"
        />
        <KpiCard
          className="col-span-2 lg:col-span-1"
          label="Réservations à venir"
          value={nf.format(r.reservations_upcoming)}
          icon={CalendarClock}
          tone="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-300"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-6">
          <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
            <h2 className="font-semibold">Informations</h2>
            <dl className="space-y-3 text-sm">
              {infos.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <dt className="sr-only">{label}</dt>
                  <dd className={value ? "min-w-0 break-words" : "text-muted-foreground"}>
                    {value ?? `${label} non renseigné(e)`}
                  </dd>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <dt className="sr-only">Propriétaires</dt>
                <dd className="min-w-0 break-words">{r.owners.length ? r.owners.join(", ") : "Aucun propriétaire"}</dd>
              </div>
            </dl>
          </section>

          <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-300">
                <QrCode className="size-4" aria-hidden />
              </span>
              <h2 className="font-semibold">QR Code</h2>
            </div>
            {r.qr_code ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <code className="rounded-md bg-muted px-2 py-1 text-xs">{r.qr_code}</code>
                <Badge variant={r.qr_active ? "secondary" : "outline"}>{r.qr_active ? "Actif" : "Inactif"}</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun QR Code.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Régénérer invalide immédiatement tous les QR Codes imprimés de ce restaurant.
            </p>
            <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
              <RefreshCw aria-hidden />
              Régénérer le QR Code
            </Button>
          </section>
        </div>

        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs" aria-labelledby="team-title">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
              <Users className="size-4" aria-hidden />
            </span>
            <h2 id="team-title" className="font-semibold">
              Équipe ({r.staff.length})
            </h2>
          </div>
          {r.staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun membre.</p>
          ) : (
            <ul className="divide-y rounded-xl border" aria-label="Équipe du restaurant">
              {r.staff.map((s, i) => {
                const m = r.members[i];
                return (
                  <li key={s.user_id}>
                    <Link
                      href={`/admin/users/${s.user_id}`}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/50"
                    >
                      <InitialsAvatar name={s.full_name} className="size-9 text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5 sm:hidden">
                          <Badge variant="outline">{roleLabel(s.role)}</Badge>
                          <UserStatusBadge status={s.status} />
                        </div>
                      </div>
                      <div className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex">
                        <Badge variant="outline">{roleLabel(s.role)}</Badge>
                        {m && !m.is_active && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Accès suspendu
                          </Badge>
                        )}
                        <UserStatusBadge status={s.status} />
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <RegenerateQrDialog
        restaurant={qrOpen ? { id: r.id, name: r.name } : null}
        onClose={() => {
          setQrOpen(false);
          void detail.refetch();
        }}
      />
    </div>
  );
}
