"use client";

/**
 * Panier partagé (page publique, borne et caisse).
 * Les prix affichés sont indicatifs : le serveur recalcule TOUJOURS le total à partir du menu.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Schemas } from "@/lib/api/client";

export type Product = Schemas["ProductOut"];
export type OptionGroup = Schemas["OptionGroupOut"];

export type CartLine = {
  key: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  basePrice: number;
  optionIds: string[];
  optionLabels: string[];
  optionsTotal: number;
  quantity: number;
  note: string;
};

export function lineUnitPrice(l: CartLine) {
  return l.basePrice + l.optionsTotal;
}

export function lineKey(productId: string, optionIds: string[], note: string) {
  return `${productId}|${[...optionIds].sort().join(",")}|${note.trim()}`;
}

export function buildLine(product: Product, optionIds: string[], quantity: number, note: string): CartLine {
  const chosen = product.option_groups.flatMap((g) => g.options.filter((o) => optionIds.includes(o.id)));
  return {
    key: lineKey(product.id, optionIds, note),
    productId: product.id,
    name: product.name,
    imageUrl: product.image_thumb_url ?? null,
    basePrice: product.effective_price,
    optionIds,
    optionLabels: chosen.map((o) => o.name),
    optionsTotal: chosen.reduce((s, o) => s + o.price_delta, 0),
    quantity,
    note: note.trim(),
  };
}

/** Vérifie les contraintes min/max de chaque groupe. Retourne un message d'erreur ou null. */
export function validateOptions(product: Product, optionIds: string[]): string | null {
  for (const g of product.option_groups) {
    const n = g.options.filter((o) => optionIds.includes(o.id)).length;
    if (n < g.min_choices) {
      return g.min_choices === 1 ? `Choisissez : ${g.name}` : `${g.name} : choisissez au moins ${g.min_choices} option(s)`;
    }
    if (n > g.max_choices) return `${g.name} : ${g.max_choices} choix maximum`;
  }
  return null;
}

export function toOrderItems(lines: CartLine[]) {
  return lines.map((l) => ({
    product_id: l.productId,
    quantity: l.quantity,
    option_ids: l.optionIds,
    note: l.note || null,
  }));
}

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * @param storageKey  clé sessionStorage pour conserver le panier (null = pas de persistance, ex. caisse)
 */
export function useCart(storageKey: string | null) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => newIdempotencyKey());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (storageKey) {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) setLines(JSON.parse(raw));
      } catch {
        /* stockage indisponible */
      }
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      /* stockage indisponible */
    }
  }, [lines, storageKey, hydrated]);

  const add = useCallback((line: CartLine) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.key === line.key);
      if (existing) {
        return prev.map((l) => (l.key === line.key ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l));
      }
      return [...prev, line];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, quantity) } : l)),
    );
  }, []);

  const remove = useCallback((key: string) => setLines((prev) => prev.filter((l) => l.key !== key)), []);

  const clear = useCallback(() => {
    setLines([]);
    setIdempotencyKey(newIdempotencyKey());
  }, []);

  /** Retire les lignes dont le produit n'est plus disponible dans le menu courant. */
  const syncWithMenu = useCallback((available: Set<string>) => {
    setLines((prev) => prev.filter((l) => available.has(l.productId)));
  }, []);

  const total = useMemo(() => lines.reduce((s, l) => s + lineUnitPrice(l) * l.quantity, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  return { lines, add, setQuantity, remove, clear, syncWithMenu, total, count, idempotencyKey, hydrated };
}

export type Cart = ReturnType<typeof useCart>;
