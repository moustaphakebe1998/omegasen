import { z } from "zod";

import type { Schemas } from "@/lib/api/client";
import { moneyInput, parseMoney } from "@/lib/format";

import { isoToLocalInput, localInputToIso, parseVatPercent, type Product, splitList, vatInput } from "./utils";

export const NO_STATION = "__none";

export function makeProductSchema(currency: string) {
  const money = (required: boolean) =>
    z
      .string()
      .trim()
      .refine((v) => (!required && v === "") || parseMoney(v, currency) !== null, {
        message: required ? "Prix requis (ex. 3500 ou 12,50)" : "Montant invalide",
      })
      .refine((v) => v === "" || (parseMoney(v, currency) ?? 0) <= 100_000_000, { message: "Montant trop élevé" });

  const option = z.object({
    uid: z.string().nullable(),
    name: z.string().trim().min(1, "Nom requis").max(80, "80 caractères maximum"),
    price: money(false),
    is_available: z.boolean(),
  });

  const count = (min: number) =>
    z
      .number({ invalid_type_error: "Nombre requis" })
      .int("Nombre entier attendu")
      .min(min, `Minimum ${min}`)
      .max(20, "Maximum 20");

  const group = z
    .object({
      uid: z.string().nullable(),
      name: z.string().trim().min(1, "Nom du groupe requis").max(80, "80 caractères maximum"),
      min_choices: count(0),
      max_choices: count(1),
      options: z.array(option).min(1, "Ajoutez au moins une option").max(40, "40 options maximum"),
    })
    .superRefine((g, ctx) => {
      if (g.max_choices < g.min_choices) {
        ctx.addIssue({ code: "custom", path: ["max_choices"], message: "Le maximum doit être ≥ au minimum" });
      }
      if (g.min_choices > g.options.length) {
        ctx.addIssue({ code: "custom", path: ["min_choices"], message: "Le minimum dépasse le nombre d'options" });
      }
    });

  const list = z.string().refine((v) => splitList(v).length <= 20, { message: "20 éléments maximum" });

  return z
    .object({
      name: z.string().trim().min(1, "Nom requis").max(120, "120 caractères maximum"),
      description: z.string().max(1000, "1000 caractères maximum"),
      category_id: z.string().min(1, "Choisissez une catégorie"),
      price: money(true),
      promo_price: money(false),
      promo_starts_at: z.string(),
      promo_ends_at: z.string(),
      is_available: z.boolean(),
      is_visible: z.boolean(),
      is_featured: z.boolean(),
      allergens: list,
      tags: list,
      preparation_minutes: z
        .string()
        .trim()
        .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= 600), { message: "Entre 0 et 600 minutes" }),
      vat: z.string().refine((v) => parseVatPercent(v) !== undefined, { message: "Taux invalide (0 à 50 %)" }),
      station_id: z.string(),
      image_media_id: z.string().nullable(),
      image_url: z.string().nullable(),
      option_groups: z.array(group).max(20, "20 groupes maximum"),
    })
    .superRefine((v, ctx) => {
      const price = parseMoney(v.price, currency);
      const promo = v.promo_price ? parseMoney(v.promo_price, currency) : null;
      if (price != null && promo != null && promo >= price) {
        ctx.addIssue({
          code: "custom",
          path: ["promo_price"],
          message: "Le prix promotionnel doit être inférieur au prix normal",
        });
      }
      if (!v.promo_price && (v.promo_starts_at || v.promo_ends_at)) {
        ctx.addIssue({ code: "custom", path: ["promo_price"], message: "Indiquez le prix promotionnel" });
      }
      if (v.promo_starts_at && v.promo_ends_at && new Date(v.promo_ends_at) <= new Date(v.promo_starts_at)) {
        ctx.addIssue({ code: "custom", path: ["promo_ends_at"], message: "La fin doit suivre le début" });
      }
    });
}

export type ProductFormValues = z.infer<ReturnType<typeof makeProductSchema>>;
export type OptionGroupFormValues = ProductFormValues["option_groups"][number];

export function productDefaults(product: Product | null, categoryId: string, currency: string): ProductFormValues {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    category_id: product?.category_id ?? categoryId,
    price: product ? moneyInput(product.price, currency) : "",
    promo_price: moneyInput(product?.promo_price, currency),
    promo_starts_at: isoToLocalInput(product?.promo_starts_at),
    promo_ends_at: isoToLocalInput(product?.promo_ends_at),
    is_available: product?.is_available ?? true,
    is_visible: product?.is_visible ?? true,
    is_featured: product?.is_featured ?? false,
    allergens: product?.allergens.join(", ") ?? "",
    tags: product?.tags.join(", ") ?? "",
    preparation_minutes: product?.preparation_minutes != null ? String(product.preparation_minutes) : "",
    vat: vatInput(product?.vat_rate_bp),
    station_id: product?.station_id ?? NO_STATION,
    image_media_id: product?.image_media_id ?? null,
    image_url: product?.image_thumb_url ?? product?.image_url ?? null,
    option_groups: (product?.option_groups ?? []).map((g) => ({
      uid: g.id,
      name: g.name,
      min_choices: g.min_choices,
      max_choices: g.max_choices,
      options: g.options.map((o) => ({
        uid: o.id,
        name: o.name,
        price: o.price_delta ? moneyInput(o.price_delta, currency) : "",
        is_available: o.is_available,
      })),
    })),
  };
}

/** Valeurs du formulaire → corps API (création ou mise à jour complète). */
export function productPayload(v: ProductFormValues, currency: string): Schemas["ProductCreate"] {
  const money = (s: string) => (s.trim() === "" ? null : parseMoney(s, currency));
  return {
    category_id: v.category_id,
    name: v.name.trim(),
    description: v.description.trim() || null,
    price: money(v.price) ?? 0,
    promo_price: money(v.promo_price),
    promo_starts_at: v.promo_price ? localInputToIso(v.promo_starts_at) : null,
    promo_ends_at: v.promo_price ? localInputToIso(v.promo_ends_at) : null,
    is_available: v.is_available,
    is_visible: v.is_visible,
    is_featured: v.is_featured,
    allergens: splitList(v.allergens),
    tags: splitList(v.tags),
    preparation_minutes: v.preparation_minutes.trim() === "" ? null : Number(v.preparation_minutes),
    vat_rate_bp: parseVatPercent(v.vat) ?? null,
    station_id: v.station_id === NO_STATION ? null : v.station_id,
    image_media_id: v.image_media_id,
    // Les identifiants existants sont renvoyés : l'API les conserve (historique des commandes).
    option_groups: v.option_groups.map((g) => ({
      id: g.uid,
      name: g.name.trim(),
      min_choices: g.min_choices,
      max_choices: g.max_choices,
      options: g.options.map((o) => ({
        id: o.uid,
        name: o.name.trim(),
        price_delta: money(o.price) ?? 0,
        is_available: o.is_available,
      })),
    })),
  };
}
