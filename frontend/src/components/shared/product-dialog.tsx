"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { buildLine, type CartLine, type Product, validateOptions } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Choix des options / suppléments, de la quantité et d'un commentaire pour un produit.
 * Utilisé par la page publique (QR / en ligne / borne) et par la caisse.
 */
export function ProductDialog({
  product,
  currency,
  open,
  onOpenChange,
  onAdd,
  large = false,
}: {
  product: Product | null;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (line: CartLine) => void;
  /** Cibles tactiles agrandies (borne, caisse). */
  large?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product || !open) return;
    // Pré-sélection : premier choix des groupes obligatoires à choix unique.
    setSelected(
      product.option_groups
        .filter((g) => g.min_choices === 1 && g.max_choices === 1 && g.options.length > 0)
        .map((g) => g.options[0].id),
    );
    setQuantity(1);
    setNote("");
    setError(null);
  }, [product, open]);

  const unit = useMemo(() => {
    if (!product) return 0;
    const deltas = product.option_groups.flatMap((g) => g.options).filter((o) => selected.includes(o.id));
    return product.effective_price + deltas.reduce((s, o) => s + o.price_delta, 0);
  }, [product, selected]);

  if (!product) return null;

  const toggle = (groupId: string, optionId: string) => {
    const group = product.option_groups.find((g) => g.id === groupId)!;
    const groupIds = group.options.map((o) => o.id);
    setError(null);
    setSelected((prev) => {
      if (group.max_choices === 1) {
        const others = prev.filter((id) => !groupIds.includes(id));
        return prev.includes(optionId) && group.min_choices === 0 ? others : [...others, optionId];
      }
      if (prev.includes(optionId)) return prev.filter((id) => id !== optionId);
      const inGroup = prev.filter((id) => groupIds.includes(id)).length;
      if (inGroup >= group.max_choices) return prev;
      return [...prev, optionId];
    });
  };

  const submit = () => {
    const err = validateOptions(product, selected);
    if (err) {
      setError(err);
      return;
    }
    onAdd(buildLine(product, selected, quantity, note));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[92dvh] overflow-y-auto p-0 sm:max-w-lg", large && "sm:max-w-2xl")}>
        {product.image_url && (
          <img src={product.image_url} alt="" className="aspect-[16/9] w-full rounded-t-lg object-cover" />
        )}
        <div className="space-y-5 px-6 pt-6">
          <DialogHeader>
            <DialogTitle className={cn(large && "text-2xl")}>{product.name}</DialogTitle>
            {product.description && <DialogDescription>{product.description}</DialogDescription>}
            {product.allergens.length > 0 && (
              <p className="text-xs text-muted-foreground">Allergènes : {product.allergens.join(", ")}</p>
            )}
          </DialogHeader>

          {product.option_groups.map((g) => {
            const count = g.options.filter((o) => selected.includes(o.id)).length;
            const required = g.min_choices > 0;
            return (
              <fieldset key={g.id} className="space-y-2">
                <legend className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
                  <span>{g.name}</span>
                  <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    {g.max_choices > 1 && `${count}/${g.max_choices}`}
                    {required ? <Badge variant="secondary">Obligatoire</Badge> : <span>Facultatif</span>}
                  </span>
                </legend>
                <div className="grid gap-2">
                  {g.options.map((o) => {
                    const active = selected.includes(o.id);
                    return (
                      <button
                        type="button"
                        key={o.id}
                        onClick={() => toggle(g.id, o.id)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-4 text-left transition-colors",
                          large ? "min-h-14 text-base" : "min-h-11 text-sm",
                          active ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted",
                        )}
                      >
                        <span>{o.name}</span>
                        {o.price_delta > 0 && (
                          <span className="tabular text-muted-foreground">+{formatMoney(o.price_delta, currency)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <div className="space-y-2">
            <label htmlFor="item-note" className="text-sm font-semibold">
              Commentaire <span className="font-normal text-muted-foreground">(facultatif)</span>
            </label>
            <Textarea
              id="item-note"
              value={note}
              maxLength={255}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sans oignons, bien cuit…"
              rows={2}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 flex-row items-center gap-3 border-t bg-background px-6 py-4 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size={large ? "lg" : "icon"}
              aria-label="Diminuer la quantité"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus />
            </Button>
            <span className="tabular w-8 text-center text-lg font-semibold" aria-live="polite">
              {quantity}
            </span>
            <Button
              type="button"
              variant="outline"
              size={large ? "lg" : "icon"}
              aria-label="Augmenter la quantité"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            >
              <Plus />
            </Button>
          </div>
          <Button size="lg" className="flex-1 sm:flex-none" onClick={submit} disabled={!product.is_available}>
            {product.is_available ? `Ajouter · ${formatMoney(unit * quantity, currency)}` : "Indisponible"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
