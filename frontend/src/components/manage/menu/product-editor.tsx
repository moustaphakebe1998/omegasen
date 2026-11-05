"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { ImageUpload } from "@/components/manage/media/image-upload";
import { useStations } from "@/components/manage/settings/use-restaurant";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, errorMessage, unwrap } from "@/lib/api/client";
import { formatPercentBp } from "@/lib/format";

import { OptionGroupsEditor } from "./option-groups-editor";
import { makeProductSchema, NO_STATION, productDefaults, type ProductFormValues, productPayload } from "./product-form";
import { type Category, menuKey, type Product } from "./utils";

type EditorProps = {
  rid: string;
  currency: string;
  defaultVatBp: number;
  categories: Category[];
  product: Product | null;
  defaultCategoryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Msg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

function SwitchField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={hint ? `${id}-hint` : undefined} />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function StationCreator({ rid, onCreated }: { rid: string; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => setOpen(true)}>
        <Plus />
        Nouveau poste
      </Button>
    );
  }
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const st = await unwrap(
        api.POST("/api/restaurants/{restaurant_id}/stations", {
          params: { path: { restaurant_id: rid } },
          body: { name: name.trim(), sort_order: 0 },
        }),
      );
      await qc.invalidateQueries({ queryKey: ["stations", rid] });
      onCreated(st.id);
      setName("");
      setOpen(false);
      toast.success("Poste créé");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-2">
      <Label htmlFor="new-station" className="sr-only">
        Nom du nouveau poste
      </Label>
      <Input
        id="new-station"
        placeholder="Ex. Grill, Bar"
        value={name}
        maxLength={60}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            create();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <Button type="button" size="sm" className="h-9" disabled={busy || !name.trim()} onClick={create}>
        {busy && <Loader2 className="animate-spin" />}
        Créer
      </Button>
    </div>
  );
}

function ProductForm({
  rid,
  currency,
  defaultVatBp,
  categories,
  product,
  defaultCategoryId,
  onOpenChange,
}: Omit<EditorProps, "open">) {
  const qc = useQueryClient();
  const schema = useMemo(() => makeProductSchema(currency), [currency]);
  const stations = useStations(rid);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: productDefaults(product, defaultCategoryId, currency),
  });
  const {
    register,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  const imageUrl = useWatch({ control, name: "image_url" });
  const promoPrice = useWatch({ control, name: "promo_price" });

  const invalid = (name: keyof ProductFormValues) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `pf-${name}-err` : undefined,
  });

  const onSubmit = form.handleSubmit(
    async (values) => {
      setFormError(null);
      const body = productPayload(values, currency);
      try {
        if (product) {
          await unwrap(
            api.PATCH("/api/restaurants/{restaurant_id}/menu/products/{product_id}", {
              params: { path: { restaurant_id: rid, product_id: product.id } },
              body,
            }),
          );
        } else {
          await unwrap(
            api.POST("/api/restaurants/{restaurant_id}/menu/products", {
              params: { path: { restaurant_id: rid } },
              body,
            }),
          );
        }
        await qc.invalidateQueries({ queryKey: menuKey(rid) });
        toast.success(product ? "Produit mis à jour" : "Produit créé");
        onOpenChange(false);
      } catch (e) {
        if (e instanceof ApiError && e.code === "invalid_promo") {
          setError(/^la fin/i.test(e.message) ? "promo_ends_at" : "promo_price", { message: e.message });
        }
        setFormError(errorMessage(e));
      }
    },
    () => setFormError("Certains champs sont invalides : vérifiez le formulaire."),
  );

  return (
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{product ? `Modifier « ${product.name} »` : "Nouveau produit"}</DialogTitle>
        <DialogDescription>Les prix sont saisis TTC, en {currency}.</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <section className="grid gap-4" aria-labelledby="pf-sec-info">
          <h3 id="pf-sec-info" className="text-sm font-semibold">
            Informations
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-name">Nom</Label>
              <Input id="pf-name" autoComplete="off" {...invalid("name")} {...register("name")} />
              <Msg id="pf-name-err" message={errors.name?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-category">Catégorie</Label>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="pf-category" className="w-full" {...invalid("category_id")}>
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Msg id="pf-category_id-err" message={errors.category_id?.message} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pf-description">Description</Label>
            <Textarea id="pf-description" rows={3} {...invalid("description")} {...register("description")} />
            <Msg id="pf-description-err" message={errors.description?.message} />
          </div>
        </section>

        <Separator />

        <section className="grid gap-4" aria-labelledby="pf-sec-price">
          <h3 id="pf-sec-price" className="text-sm font-semibold">
            Prix
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-price">Prix ({currency})</Label>
              <Input id="pf-price" inputMode="decimal" placeholder={currency === "XOF" ? "3500" : "12,50"} {...invalid("price")} {...register("price")} />
              <Msg id="pf-price-err" message={errors.price?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-promo">Prix promotionnel ({currency}, facultatif)</Label>
              <Input id="pf-promo" inputMode="decimal" {...invalid("promo_price")} {...register("promo_price")} />
              <Msg id="pf-promo_price-err" message={errors.promo_price?.message} />
            </div>
          </div>
          {promoPrice?.trim() && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-promo-start">Début de la promotion (facultatif)</Label>
                <Input id="pf-promo-start" type="datetime-local" {...invalid("promo_starts_at")} {...register("promo_starts_at")} />
                <Msg id="pf-promo_starts_at-err" message={errors.promo_starts_at?.message} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-promo-end">Fin de la promotion (facultatif)</Label>
                <Input id="pf-promo-end" type="datetime-local" {...invalid("promo_ends_at")} {...register("promo_ends_at")} />
                <Msg id="pf-promo_ends_at-err" message={errors.promo_ends_at?.message} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Sans dates, la promotion s&apos;applique immédiatement et sans limite.
              </p>
            </div>
          )}
        </section>

        <Separator />

        <section className="grid gap-3" aria-labelledby="pf-sec-vis">
          <h3 id="pf-sec-vis" className="text-sm font-semibold">
            Visibilité
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Controller
              control={control}
              name="is_available"
              render={({ field }) => (
                <SwitchField id="pf-available" label="Disponible" hint="Décochez en cas de rupture." checked={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={control}
              name="is_visible"
              render={({ field }) => (
                <SwitchField id="pf-visible" label="Visible" hint="Masqué : absent de la carte client." checked={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={control}
              name="is_featured"
              render={({ field }) => (
                <SwitchField id="pf-featured" label="Mis en avant" hint="Affiché en tête de carte." checked={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </section>

        <Separator />

        <section className="grid gap-4" aria-labelledby="pf-sec-details">
          <h3 id="pf-sec-details" className="text-sm font-semibold">
            Détails
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pf-allergens">Allergènes</Label>
              <Input id="pf-allergens" placeholder="gluten, arachide, lait" {...invalid("allergens")} {...register("allergens")} />
              <p className="text-xs text-muted-foreground">Séparés par des virgules.</p>
              <Msg id="pf-allergens-err" message={errors.allergens?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-tags">Étiquettes</Label>
              <Input id="pf-tags" placeholder="épicé, végétarien" {...invalid("tags")} {...register("tags")} />
              <p className="text-xs text-muted-foreground">Séparées par des virgules.</p>
              <Msg id="pf-tags-err" message={errors.tags?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-prep">Temps de préparation (minutes)</Label>
              <Input id="pf-prep" inputMode="numeric" {...invalid("preparation_minutes")} {...register("preparation_minutes")} />
              <Msg id="pf-preparation_minutes-err" message={errors.preparation_minutes?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-vat">TVA spécifique (%)</Label>
              <Input
                id="pf-vat"
                inputMode="decimal"
                placeholder={`Par défaut : ${formatPercentBp(defaultVatBp)}`}
                {...invalid("vat")}
                {...register("vat")}
              />
              <p className="text-xs text-muted-foreground">Laissez vide pour appliquer le taux du restaurant.</p>
              <Msg id="pf-vat-err" message={errors.vat?.message} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pf-station">Poste de cuisine</Label>
              <Controller
                control={control}
                name="station_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="pf-station" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_STATION}>Aucun poste</SelectItem>
                      {(stations.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <StationCreator rid={rid} onCreated={(id) => setValue("station_id", id, { shouldDirty: true })} />
            </div>
          </div>
        </section>

        <Separator />

        <section aria-label="Image">
          <ImageUpload
            rid={rid}
            kind="PRODUCT"
            label="Photo du produit"
            previewUrl={imageUrl}
            onUploaded={(m) => {
              setValue("image_media_id", m.id, { shouldDirty: true });
              setValue("image_url", m.thumb_url, { shouldDirty: true });
            }}
            onRemove={() => {
              setValue("image_media_id", null, { shouldDirty: true });
              setValue("image_url", null, { shouldDirty: true });
            }}
            description="La photo est enregistrée avec le produit."
          />
        </section>

        <Separator />

        <section className="grid gap-3" aria-labelledby="pf-sec-options">
          <div>
            <h3 id="pf-sec-options" className="text-sm font-semibold">
              Options et suppléments
            </h3>
            <p className="text-xs text-muted-foreground">Le supplément s&apos;ajoute au prix du produit (0 = inclus).</p>
          </div>
          <OptionGroupsEditor control={control} register={register} errors={errors} currency={currency} />
        </section>

        {formError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

        <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            {product ? "Enregistrer" : "Créer le produit"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Création / modification d'un produit (avec ses options). */
export function ProductEditor(props: EditorProps) {
  const { open, onOpenChange, product, defaultCategoryId } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ProductForm key={product?.id ?? `new-${defaultCategoryId}`} {...props} />}
    </Dialog>
  );
}
