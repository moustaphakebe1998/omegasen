"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { Schemas } from "@/lib/api/client";
import type { Product } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function ProductGrid({
  categories,
  currency,
  onPick,
}: {
  categories: Schemas["CategoryOut"][];
  currency: string;
  onPick: (p: Product) => void;
}) {
  const [active, setActive] = useState<string | "all">("all");
  const [q, setQ] = useState("");

  const products = useMemo(() => {
    const needle = normalize(q.trim());
    const source =
      needle || active === "all"
        ? categories
        : categories.filter((c) => c.id === active);
    return source
      .flatMap((c) => c.products)
      .filter(
        (p) =>
          !needle ||
          normalize(p.name).includes(needle) ||
          p.tags.some((t) => normalize(t).includes(needle)),
      );
  }, [categories, active, q]);

  const tab = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={active === id && !q}
      onClick={() => {
        setActive(id);
        setQ("");
      }}
      className={cn(
        "min-h-12 shrink-0 rounded-full border-2 px-5 text-base font-semibold whitespace-nowrap",
        active === id && !q
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b bg-background p-3">
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un produit"
            aria-label="Rechercher un produit"
            className="h-12 pr-12 pl-10 text-base"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Effacer la recherche"
              className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="toolbar"
          aria-label="Catégories"
        >
          {tab("all", "Tout")}
          {categories.map((c) => tab(c.id, c.name))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {products.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">
            Aucun produit.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => {
              const promo = p.effective_price < p.price;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!p.is_available}
                  onClick={() => onPick(p)}
                  className={cn(
                    "relative flex min-h-28 flex-col overflow-hidden rounded-xl border-2 bg-background text-left transition-transform active:scale-[0.97]",
                    p.is_available
                      ? "border-border active:border-primary"
                      : "cursor-not-allowed opacity-45 grayscale",
                  )}
                >
                  {/* Image dans son propre bandeau, jamais sous le texte. */}
                  {p.image_thumb_url && (
                    <img
                      src={p.image_thumb_url}
                      alt=""
                      className="aspect-[16/9] w-full shrink-0 bg-muted object-cover"
                    />
                  )}
                  <span className="flex flex-1 flex-col justify-between gap-2 p-3">
                    <span className="line-clamp-2 text-base leading-tight font-semibold">
                      {p.name}
                    </span>
                    <span className="flex items-end justify-between gap-2">
                      <span className="tabular text-lg font-black">
                        {formatMoney(p.effective_price, currency)}
                        {promo && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground line-through">
                            {formatMoney(p.price, currency)}
                          </span>
                        )}
                      </span>
                      {p.option_groups.length > 0 && (
                        <SlidersHorizontal
                          className="size-4 text-muted-foreground"
                          aria-label="Avec options"
                        />
                      )}
                    </span>
                  </span>
                  {!p.is_available && (
                    <span className="absolute top-2 right-2 rounded bg-destructive px-1.5 text-xs font-bold text-white">
                      Rupture
                    </span>
                  )}
                  {!p.is_visible && p.is_available && (
                    <span className="absolute top-2 right-2 rounded bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                      Masqué
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
