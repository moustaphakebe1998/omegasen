"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { actionErrorMessage } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import type { Category } from "./orders";

export function staffMenuQuery(rid: string) {
  return {
    queryKey: ["staff-menu", rid] as const,
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}/menu", { params: { path: { restaurant_id: rid } } })),
  };
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Ruptures de stock : la cuisine peut marquer un produit indisponible en un geste. */
export function StockSheet({
  rid,
  open,
  onOpenChange,
}: {
  rid: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const menu = useQuery({ ...staffMenuQuery(rid), enabled: open });

  const toggle = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      unwrap(
        api.POST("/api/restaurants/{restaurant_id}/menu/products/{product_id}/availability", {
          params: { path: { restaurant_id: rid, product_id: id } },
          body: { is_available: value },
        }),
      ),
    onMutate: async ({ id, value }) => {
      const key = staffMenuQuery(rid).queryKey;
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Category[]>(key);
      qc.setQueryData<Category[]>(key, (cats) =>
        cats?.map((c) => ({
          ...c,
          products: c.products.map((p) => (p.id === id ? { ...p, is_available: value } : p)),
        })),
      );
      return { previous };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(staffMenuQuery(rid).queryKey, ctx.previous);
      toast.error(actionErrorMessage(e));
    },
    onSuccess: (p) => toast.success(p.is_available ? `${p.name} : de nouveau disponible` : `${p.name} : en rupture`),
  });

  const filtered = useMemo(() => {
    const needle = normalize(q.trim());
    return (menu.data ?? [])
      .map((c) => ({ ...c, products: c.products.filter((p) => !needle || normalize(p.name).includes(needle)) }))
      .filter((c) => c.products.length > 0);
  }, [menu.data, q]);

  const outCount = (menu.data ?? []).reduce((n, c) => n + c.products.filter((p) => !p.is_available).length, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="dark w-full gap-0 bg-neutral-950 text-neutral-50 sm:max-w-md">
        <SheetHeader className="border-b border-neutral-800">
          <SheetTitle className="text-xl text-neutral-50">Ruptures de stock</SheetTitle>
          <SheetDescription>
            Désactivez un produit pour le retirer immédiatement des commandes.{" "}
            {outCount > 0 && <strong className="text-red-300">{outCount} en rupture.</strong>}
          </SheetDescription>
          <div className="relative mt-2">
            <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un produit"
              aria-label="Rechercher un produit"
              className="h-12 pl-10 text-base"
            />
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {menu.isLoading && (
            <p className="flex items-center gap-2 text-neutral-400">
              <Loader2 className="size-4 animate-spin" /> Chargement du menu…
            </p>
          )}
          {menu.isError && <p className="text-red-300">{errorMessage(menu.error)}</p>}
          {menu.data && filtered.length === 0 && <p className="text-neutral-400">Aucun produit.</p>}
          {filtered.map((c) => (
            <section key={c.id} className="mb-5">
              <h3 className="mb-2 text-sm font-semibold tracking-wide text-neutral-400 uppercase">{c.name}</h3>
              <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
                {c.products.map((p) => {
                  const id = `avail-${p.id}`;
                  return (
                    <li key={p.id} className="flex min-h-14 items-center justify-between gap-3 px-3">
                      <label
                        htmlFor={id}
                        className={cn(
                          "flex-1 py-3 text-base font-medium",
                          !p.is_available && "text-red-300 line-through",
                        )}
                      >
                        {p.name}
                        {!p.is_available && <span className="ml-2 text-xs font-semibold no-underline">RUPTURE</span>}
                      </label>
                      <Switch
                        id={id}
                        checked={p.is_available}
                        onCheckedChange={(v) => toggle.mutate({ id: p.id, value: v })}
                        aria-label={`${p.name} disponible`}
                        className="scale-125"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
