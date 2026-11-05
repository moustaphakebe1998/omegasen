"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage, unwrap } from "@/lib/api/client";

const schema = z.object({ email: z.string().trim().email("Adresse email invalide") });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const email = v.email.toLowerCase();
      await unwrap(api.POST("/api/auth/forgot-password", { body: { email } }));
      setSentTo(email);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-10">
      <Logo className="text-xl" />
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {sentTo ? (
          <div className="flex flex-col items-center gap-4 text-center" role="status">
            <span className="flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
              <MailCheck className="size-7" aria-hidden />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Vérifiez votre boîte mail</h1>
            <p className="text-sm text-muted-foreground">
              Si un compte existe pour <strong className="break-all text-foreground">{sentTo}</strong>, vous allez
              recevoir un email contenant un lien pour choisir un nouveau mot de passe. Pensez à regarder dans vos
              courriers indésirables.
            </p>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link href="/login">Retour à la connexion</Link>
              </Button>
              <Button variant="outline" onClick={() => setSentTo(null)}>
                Utiliser une autre adresse
              </Button>
            </div>
          </div>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="size-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Mot de passe oublié</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Indiquez l&apos;adresse email de votre compte : nous vous enverrons un lien pour choisir un nouveau mot
              de passe.
            </p>
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  className="h-11"
                  aria-invalid={!!errors.email}
                  {...form.register("email")}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="h-11 w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Envoyer le lien
              </Button>
            </form>
            <Button asChild variant="ghost" size="sm" className="mt-4 w-full">
              <Link href="/login">
                <ArrowLeft aria-hidden /> Retour à la connexion
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
