"use client";

import { ImageOff, Plus } from "lucide-react";
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
        "group flex h-full w-full gap-3 rounded-xl border bg-card text-left shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        large ? "min-h-36 p-4" : "min-h-28 p-3",
        p.is_available ? "hover:border-primary/50 hover:bg-muted/40" : "cursor-not-allowed opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("font-semibold break-words", large && "text-lg")}>{p.name}</span>
          {p.is_featured && p.is_available && (
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Recommandé
            </Badge>
          )}
          {promo && p.is_available && <Badge className="bg-red-600 text-white">Promo</Badge>}
        </div>
        {p.description && (
          <p className={cn("mt-1 line-clamp-2 text-muted-foreground", large ? "text-base" : "text-sm")}>{p.description}</p>
        )}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          {p.is_available ? (
            <>
              <span className={cn("tabular font-semibold", promo && "text-red-600 dark:text-red-400", large && "text-lg")}>
                {formatMoney(p.effective_price, currency)}
              </span>
              {promo && (
                <s className="tabular text-sm text-muted-foreground">{formatMoney(p.price, currency)}</s>
              )}
            </>
          ) : (
            <Badge variant="outline">Indisponible</Badge>
          )}
        </div>
      </div>
      <div className={cn("relative shrink-0", large ? "size-28" : "size-24")}>
        {p.image_thumb_url || p.image_url ? (
          <img
            src={p.image_thumb_url ?? p.image_url ?? ""}
            alt=""
            loading="lazy"
            className="size-full rounded-lg object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
          </span>
        )}
        {p.is_available && (
          <span
            className={cn(
              "absolute -right-1.5 -bottom-1.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110",
              large ? "size-10" : "size-8",
            )}
            aria-hidden
          >
            <Plus className="size-4" />
          </span>
        )}
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
                active === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted",
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
            <ul className={cn("mt-3 grid gap-3", large ? "lg:grid-cols-2" : "sm:grid-cols-2")}>
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
