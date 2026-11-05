"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

export function OpenBadge({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <Badge
      className={cn(
        "border-transparent",
        open
          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
          : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
        className,
      )}
    >
      <span
        className={`size-1.5 rounded-full ${open ? "bg-green-600" : "bg-neutral-500"}`}
        aria-hidden
      />
      {open ? "Ouvert" : "Fermé"}
    </Badge>
  );
}

function RestaurantCard({ r }: { r: Schemas["PublicRestaurantCard"] }) {
  const meta = [r.cuisine, r.city].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/r/${r.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/80 to-amber-300">
        {r.cover_url ? (
          <img
            src={r.cover_url}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <UtensilsCrossed
            className="absolute inset-0 m-auto size-10 text-white/70"
            aria-hidden
          />
        )}
      </div>
      {/* Logo et texte sous l'image (plus de chevauchement). */}
      <div className="flex flex-1 items-start gap-3 p-4">
        <div className="size-12 shrink-0 overflow-hidden rounded-xl border bg-muted">
          {r.logo_url ? (
            <img
              src={r.logo_url}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-primary/10 text-lg font-bold text-primary">
              {r.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-semibold group-hover:text-primary">
              {r.name}
            </h3>
            <OpenBadge open={r.is_open_now} className="shrink-0" />
          </div>
          {meta && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
              {r.city && <MapPin className="size-3.5 shrink-0" aria-hidden />}
              <span className="truncate">{meta}</span>
            </p>
          )}
          {r.description && (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {r.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Recherche de restaurants (GET /api/public/restaurants). */
export function RestaurantSearch() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const query = useQuery({
    queryKey: ["public-restaurants", q, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/public/restaurants", {
          params: { query: { q: q || undefined, page, page_size: PAGE_SIZE } },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section
      id="restaurants"
      aria-labelledby="restaurants-title"
      className="mx-auto w-full max-w-7xl scroll-mt-20 px-4"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="restaurants-title"
            className="text-2xl font-semibold tracking-tight"
          >
            Trouver un restaurant
          </h2>
          <p className="text-sm text-muted-foreground">
            Consultez le menu et commandez en ligne.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="restaurant-search" className="sr-only">
            Rechercher un restaurant
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="restaurant-search"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nom, cuisine, ville…"
            className="h-11 pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      {query.isPending ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Chargement des restaurants"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-60 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={Store}
          title="Impossible de charger les restaurants"
          description={errorMessage(query.error)}
          action={
            <Button variant="outline" onClick={() => query.refetch()}>
              Réessayer
            </Button>
          }
        />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Aucun restaurant trouvé"
          description={
            q
              ? `Aucun résultat pour « ${q} ».`
              : "Aucun restaurant n'est encore disponible."
          }
        />
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            {total} restaurant{total > 1 ? "s" : ""} trouvé
            {total > 1 ? "s" : ""}
          </p>
          <ul
            className={cn(
              "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
              query.isPlaceholderData && "opacity-60",
            )}
          >
            {query.data.items.map((r) => (
              <li key={r.slug}>
                <RestaurantCard r={r} />
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav
              className="mt-6 flex items-center justify-center gap-3"
              aria-label="Pagination"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft aria-hidden /> Précédent
              </Button>
              <span className="tabular text-sm text-muted-foreground">
                Page {page} / {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
              >
                Suivant <ChevronRight aria-hidden />
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
