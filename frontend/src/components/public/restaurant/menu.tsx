"use client";

import { Plus, UtensilsCrossed } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { Schemas } from "@/lib/api/client";
import type { Product } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Category = Schemas["CategoryOut"];

const NAV_OFFSET = 72;

function ProductCard({
  product: p,
  currency,
  large,
  onSelect,
}: {
  product: Product;
  currency: string;
  large: boolean;
  onSelect: (p: Product) => void;
}) {
  const promo = p.effective_price < p.price;
  return (
    <button
      type="button"
      onClick={() => onSelect(p)}
      disabled={!p.is_available}
      aria-label={
        p.is_available
          ? `${p.name}, ${formatMoney(p.effective_price, currency)}${promo ? ` au lieu de ${formatMoney(p.price, currency)}` : ""}`
          : `${p.name}, indisponible`
      }
      className={cn(
        // Mobile : image à gauche, texte à droite. À partir de sm : image en haut, texte dessous.
        "group flex h-full w-full overflow-hidden rounded-2xl border bg-card text-left shadow-xs transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-col",
        p.is_available
          ? "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          : "cursor-not-allowed opacity-60",
      )}
    >
      <div className={cn("shrink-0 overflow-hidden bg-muted sm:aspect-[4/3] sm:w-full", large ? "w-36" : "w-28")}>
        {p.image_url || p.image_thumb_url ? (
          <img
            src={p.image_url ?? p.image_thumb_url ?? ""}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="flex size-full min-h-28 items-center justify-center bg-gradient-to-br from-primary/15 to-amber-200/40 text-primary/60">
            <UtensilsCrossed className="size-7" aria-hidden />
          </span>
        )}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col", large ? "p-4" : "p-3 sm:p-4")}>
        {(p.is_featured || promo) && p.is_available && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {p.is_featured && (
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                Recommandé
              </Badge>
            )}
            {promo && <Badge className="bg-red-600 text-white">Promo</Badge>}
          </div>
        )}
        <span className={cn("font-semibold leading-snug break-words", large && "text-lg")}>{p.name}</span>
        {p.description && (
          <p className={cn("mt-1 line-clamp-2 text-muted-foreground", large ? "text-base" : "text-sm")}>
            {p.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          {p.is_available ? (
            <>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn("tabular font-bold", promo && "text-red-600 dark:text-red-400", large && "text-lg")}
                >
                  {formatMoney(p.effective_price, currency)}
                </span>
                {promo && <s className="tabular text-sm text-muted-foreground">{formatMoney(p.price, currency)}</s>}
              </span>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full bg-primary font-semibold text-primary-foreground shadow-sm transition-transform group-hover:scale-105",
                  large ? "h-11 px-4 text-base" : "h-9 px-3 text-sm",
                )}
                aria-hidden
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Ajouter</span>
              </span>
            </>
          ) : (
            <Badge variant="outline">Indisponible</Badge>
          )}
        </div>
      </div>
    </button>
  );
}

/** Menu : navigation par catégorie (collante, avec suivi du défilement) + cartes produits. */
export function Menu({
  categories,
  currency,
  large,
  onSelect,
}: {
  categories: Category[];
  currency: string;
  large: boolean;
  onSelect: (p: Product) => void;
}) {
  const [active, setActive] = useState<string | null>(categories[0]?.id ?? null);
  const navRef = useRef<HTMLDivElement>(null);
  const clickLock = useRef(0);

  // Suivi du défilement : la dernière section dont le haut est passé sous la barre est active.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (Date.now() < clickLock.current) return;
        let current = categories[0]?.id ?? null;
        for (const c of categories) {
          const el = document.getElementById(`cat-${c.id}`);
          if (el && el.getBoundingClientRect().top - NAV_OFFSET - 8 <= 0) current = c.id;
        }
        setActive(current);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [categories]);

  // Garde l'onglet actif visible dans la barre horizontale.
  useEffect(() => {
    if (!active || !navRef.current) return;
    const btn = navRef.current.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    if (!btn) return;
    const nav = navRef.current;
    const left = btn.offsetLeft - nav.clientWidth / 2 + btn.clientWidth / 2;
    nav.scrollTo({ left, behavior: "smooth" });
  }, [active]);

  const goTo = (id: string) => {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    setActive(id);
    clickLock.current = Date.now() + 800;
    const top = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET + 1;
    window.scrollTo({ top, behavior: "smooth" });
    el.focus({ preventScroll: true });
  };

  if (categories.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">Le menu n&apos;est pas encore disponible.</p>;
  }

  return (
    <div>
      <nav
        aria-label="Catégories du menu"
        className="sticky top-0 z-20 -mx-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <div ref={navRef} className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          {categories.map((c) => (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              data-cat={c.id}
              aria-current={active === c.id ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                goTo(c.id);
              }}
              className={cn(
                "shrink-0 rounded-full border px-4 font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                large ? "py-3 text-base" : "py-2 text-sm",
                active === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {c.name}
            </a>
          ))}
        </div>
      </nav>

      <div className="mt-4 space-y-8">
        {categories.map((c) => (
          <section
            key={c.id}
            id={`cat-${c.id}`}
            tabIndex={-1}
            aria-labelledby={`cat-title-${c.id}`}
            className="outline-none"
          >
            <h2 id={`cat-title-${c.id}`} className={cn("font-bold tracking-tight", large ? "text-2xl" : "text-xl")}>
              {c.name}
            </h2>
            {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
            <ul
              className={cn(
                "mt-3 grid gap-3 sm:gap-4",
                large ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {c.products.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} currency={currency} large={large} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
