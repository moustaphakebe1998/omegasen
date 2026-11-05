"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CircleCheck, Loader2, MailCheck, QrCode, Store, Timer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, unwrap } from "@/lib/api/client";

const optional = (max: number) => z.string().trim().max(max).optional();

const schema = z.object({
  restaurant_name: z.string().trim().min(2, "Indiquez le nom du restaurant").max(120),
  contact_name: z.string().trim().min(2, "Indiquez votre nom").max(120),
  email: z.string().trim().email("Adresse email invalide"),
  phone: optional(32),
  city: optional(80),
  cuisine: optional(80),
  message: optional(2000),
});
type Values = z.infer<typeof schema>;

const orNull = (v?: string) => (v && v.trim() ? v.trim() : null);

const BENEFITS = [
  { icon: QrCode, text: "Un QR Code permanent pour votre restaurant" },
  { icon: Store, text: "Menu en ligne, cuisine et caisse en temps réel" },
  { icon: Timer, text: "Mise en service rapide par notre équipe" },
];

export default function RequestPage() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      restaurant_name: "",
      contact_name: "",
      email: "",
      phone: "",
      city: "",
      cuisine: "",
      message: "",
    },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await unwrap(
        api.POST("/api/public/restaurant-requests", {
          body: {
            restaurant_name: v.restaurant_name,
            contact_name: v.contact_name,
            email: v.email.toLowerCase(),
            phone: orNull(v.phone),
            city: orNull(v.city),
            cuisine: orNull(v.cuisine),
            message: orNull(v.message),
          },
        }),
      );
      setSentTo(v.email);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const field = (name: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} aria-invalid={!!errors[name]} {...props} {...form.register(name)} />
      {errors[name] && <p className="text-sm text-destructive">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Colonne visuelle : photo dans son propre bloc, texte sur fond opaque en dessous. */}
      <aside className="hidden flex-col bg-neutral-900 text-white lg:flex">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <img src="/landing/manager.webp" alt="" className="size-full object-cover" />
        </div>
        <div className="space-y-5 p-10">
          <h2 className="text-3xl font-bold tracking-tight">Rejoignez OmegaSen</h2>
          <p className="text-neutral-300">
            Les restaurants sont ouverts sur la plateforme par notre équipe. Envoyez-nous votre demande : nous créons
            votre espace et vous envoyons un lien pour activer votre compte.
          </p>
          <ul className="space-y-3">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <b.icon className="size-4 text-orange-300" aria-hidden />
                </span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-col bg-muted/30">
        <header className="flex h-16 items-center justify-between gap-2 px-4 sm:px-8">
          <Logo />
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft aria-hidden /> Accueil
            </Link>
          </Button>
        </header>

        <div className="flex flex-1 items-start justify-center px-4 pb-12 sm:px-8 lg:items-center">
          <div className="w-full max-w-xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            {sentTo ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center" role="status">
                <span className="flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <MailCheck className="size-7" aria-hidden />
                </span>
                <h1 className="text-2xl font-bold tracking-tight">Demande envoyée</h1>
                <p className="max-w-sm text-muted-foreground">
                  Merci ! Notre équipe étudie votre demande et vous recontacte à <strong>{sentTo}</strong>. Une fois le
                  restaurant créé, vous recevrez un lien pour activer votre compte.
                </p>
                <Button asChild variant="outline">
                  <Link href="/">Retour à l&apos;accueil</Link>
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight">Demander l&apos;ouverture d&apos;un restaurant</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Réponse sous 48 h ouvrées. Déjà un compte ?{" "}
                  <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                    Se connecter
                  </Link>
                </p>

                <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
                  <fieldset className="space-y-4">
                    <legend className="mb-1 text-sm font-semibold">Le restaurant</legend>
                    {field("restaurant_name", "Nom du restaurant", {
                      autoComplete: "organization",
                    })}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {field("city", "Ville (facultatif)", {
                        autoComplete: "address-level2",
                      })}
                      {field("cuisine", "Type de cuisine (facultatif)", {
                        placeholder: "Sénégalaise, pizzeria…",
                      })}
                    </div>
                  </fieldset>
                  <fieldset className="space-y-4">
                    <legend className="mb-1 text-sm font-semibold">Vos coordonnées</legend>
                    {field("contact_name", "Nom complet", {
                      autoComplete: "name",
                    })}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {field("email", "Email", {
                        type: "email",
                        autoComplete: "email",
                      })}
                      {field("phone", "Téléphone (facultatif)", {
                        type: "tel",
                        autoComplete: "tel",
                      })}
                    </div>
                  </fieldset>
                  <div className="space-y-1.5">
                    <Label htmlFor="message">Message (facultatif)</Label>
                    <Textarea
                      id="message"
                      rows={4}
                      placeholder="Nombre de tables, besoins particuliers…"
                      {...form.register("message")}
                    />
                  </div>

                  {error && (
                    <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <CircleCheck />}
                    Envoyer ma demande
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
