"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage } from "@/lib/api/client";

import { aria, Field, FormError } from "./fields";
import { type Restaurant, useUpdateRestaurant } from "./use-restaurant";

const optional = (max: number) => z.string().trim().max(max, `${max} caractères maximum`);
const coord = (limit: number) =>
  z
    .string()
    .trim()
    .refine((v) => {
      if (v === "") return true;
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) && Math.abs(n) <= limit;
    }, `Nombre entre -${limit} et ${limit}`);

const schema = z.object({
  name: z.string().trim().min(2, "2 caractères minimum").max(120, "120 caractères maximum"),
  slug: z
    .string()
    .trim()
    .min(2, "2 caractères minimum")
    .max(80, "80 caractères maximum")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lettres minuscules, chiffres et tirets uniquement (ex. le-baobab)"),
  description: optional(2000),
  cuisine: optional(80),
  phone: optional(32),
  email: z.union([z.literal(""), z.string().trim().email("Adresse email invalide")]),
  website: optional(255),
  address_line: optional(255),
  postal_code: optional(20),
  city: optional(120),
  latitude: coord(90),
  longitude: coord(180),
});
type Values = z.infer<typeof schema>;

function defaults(r: Restaurant): Values {
  return {
    name: r.name,
    slug: r.slug,
    description: r.description ?? "",
    cuisine: r.cuisine ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    website: r.website ?? "",
    address_line: r.address_line ?? "",
    postal_code: r.postal_code ?? "",
    city: r.city ?? "",
    latitude: r.latitude != null ? String(r.latitude) : "",
    longitude: r.longitude != null ? String(r.longitude) : "",
  };
}

export function InfoForm({ restaurant }: { restaurant: Restaurant }) {
  const update = useUpdateRestaurant(restaurant.id);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(restaurant) });
  const {
    register,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = form;
  const slug = useWatch({ control, name: "slug" });
  const slugChanged = slug.trim() !== restaurant.slug;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const s = (x: string) => x.trim() || null;
    const n = (x: string) => (x.trim() === "" ? null : Number(x.replace(",", ".")));
    try {
      const data = await update({
        name: v.name.trim(),
        ...(slugChanged ? { slug: v.slug.trim() } : {}),
        description: s(v.description),
        cuisine: s(v.cuisine),
        phone: s(v.phone),
        email: s(v.email),
        website: s(v.website),
        address_line: s(v.address_line),
        postal_code: s(v.postal_code),
        city: s(v.city),
        latitude: n(v.latitude),
        longitude: n(v.longitude),
      });
      form.reset(defaults(data));
      toast.success("Informations enregistrées");
    } catch (e) {
      if (e instanceof ApiError && e.code === "slug_taken") {
        form.setError("slug", { message: "Cette adresse est déjà utilisée par un autre établissement." });
      }
      setError(errorMessage(e));
    }
  });

  const text = (name: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <Field id={`info-${name}`} label={label} error={errors[name]?.message} hint={hint}>
      <Input {...aria(`info-${name}`, errors[name]?.message, !!hint)} {...props} {...register(name)} />
    </Field>
  );

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
          <CardDescription>Affichées sur votre page publique et vos tickets.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {text("name", "Nom de l'établissement")}
            <Field
              id="info-slug"
              label="Adresse de la page publique"
              error={errors.slug?.message}
              hint={
                <>
                  Votre page : <span className="font-mono">/r/{slug || "…"}</span>
                </>
              }
            >
              <Input {...aria("info-slug", errors.slug?.message, true)} autoCapitalize="none" spellCheck={false} {...register("slug")} />
            </Field>
          </div>
          {slugChanged && !errors.slug && (
            <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Votre QR Code n&apos;est pas affecté, mais les anciens liens vers /r/{restaurant.slug} (partagés, réseaux
              sociaux…) ne fonctionneront plus.
            </p>
          )}
          <Field id="info-description" label="Description" error={errors.description?.message}>
            <Textarea rows={3} {...aria("info-description", errors.description?.message)} {...register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("cuisine", "Type de cuisine", { placeholder: "Ex. Sénégalaise, Italienne" })}
            {text("phone", "Téléphone", { type: "tel", autoComplete: "tel" })}
            {text("email", "Email de contact", { type: "email", autoComplete: "email" })}
            {text("website", "Site web", { type: "url", placeholder: "https://" })}
          </div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            {text("address_line", "Adresse", { autoComplete: "street-address" })}
            {text("postal_code", "Code postal", { autoComplete: "postal-code" })}
            {text("city", "Ville", { autoComplete: "address-level2" })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("latitude", "Latitude (facultatif)", { inputMode: "decimal", placeholder: "14.6928" })}
            {text("longitude", "Longitude (facultatif)", { inputMode: "decimal", placeholder: "-17.4467" })}
          </div>
          <FormError message={error} />
        </CardContent>
        <CardFooter className="justify-end gap-2 pt-6">
          <Button type="button" variant="outline" disabled={!isDirty || isSubmitting} onClick={() => form.reset()}>
            Annuler
          </Button>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
