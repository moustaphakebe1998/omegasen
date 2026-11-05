"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, History, Loader2, MailCheck, CalendarCheck, UserRoundPlus, Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api, errorMessage, unwrap } from "@/lib/api/client";

const schema = z.object({
  full_name: z.string().trim().min(2, "Indiquez votre nom").max(120),
  email: z.string().trim().email("Adresse email invalide"),
  phone: z.string().trim().max(32, "32 caractères maximum").optional(),
});
type Values = z.infer<typeof schema>;

const BENEFITS = [
  { icon: History, text: "Retrouvez l'historique de vos commandes", tone: "bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300" },
  { icon: CalendarCheck, text: "Suivez vos réservations", tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300" },
  { icon: Bell, text: "Soyez prévenu quand votre commande est prête", tone: "bg-green-50 text-green-600 dark:bg-green-950/60 dark:text-green-300" },
];

export default function CustomerSignupPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; taken: boolean } | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", phone: "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const email = v.email.toLowerCase();
      await unwrap(
        api.POST("/api/auth/signup", {
          body: { email, full_name: v.full_name, phone: v.phone ? v.phone : null },
        }),
      );
      setSentTo(email);
    } catch (e) {
      setError({ message: errorMessage(e), taken: e instanceof ApiError && e.code === "email_taken" });
    }
  });

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="flex h-16 items-center justify-between gap-2 px-4 sm:px-8">
        <Logo />
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft aria-hidden /> Accueil
          </Link>
        </Button>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-12 sm:px-8 md:items-center">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {sentTo ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center" role="status">
              <span className="flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                <MailCheck className="size-7" aria-hidden />
              </span>
              <h1 className="text-2xl font-bold tracking-tight">Vérifiez votre boîte mail</h1>
              <p className="text-sm text-muted-foreground">
                Nous avons envoyé un lien à <strong className="break-all text-foreground">{sentTo}</strong>. Ouvrez-le
                pour choisir votre mot de passe et activer votre compte client. Pensez à regarder dans vos courriers
                indésirables.
              </p>
              <Button asChild variant="outline">
                <Link href="/">Retour à l&apos;accueil</Link>
              </Button>
            </div>
          ) : (
            <>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UserRoundPlus className="size-6" aria-hidden />
              </span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">Créer un compte client</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Facultatif : vous pouvez toujours commander sans compte.
              </p>

              <ul className="mt-5 grid gap-2.5">
                {BENEFITS.map(({ icon: Icon, text, tone }) => (
                  <li key={text} className="flex items-center gap-3 text-sm">
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>

              <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Nom complet</Label>
                  <Input
                    id="full_name"
                    autoComplete="name"
                    className="h-11"
                    aria-invalid={!!errors.full_name}
                    {...form.register("full_name")}
                  />
                  {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="h-11"
                    aria-invalid={!!errors.email}
                    {...form.register("email")}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">
                    Téléphone <span className="font-normal text-muted-foreground">(facultatif)</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    className="h-11"
                    aria-invalid={!!errors.phone}
                    {...form.register("phone")}
                  />
                  {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
                </div>
                {error && (
                  <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    <p>{error.message}</p>
                    {error.taken && (
                      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-medium">
                        <Link href="/login" className="underline underline-offset-4">
                          Se connecter
                        </Link>
                        <Link href="/mot-de-passe-oublie" className="underline underline-offset-4">
                          Mot de passe oublié ?
                        </Link>
                      </p>
                    )}
                  </div>
                )}
                <Button type="submit" size="lg" className="h-11 w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                  Créer mon compte
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Déjà un compte ?{" "}
                  <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                    Se connecter
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
