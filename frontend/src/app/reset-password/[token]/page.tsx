"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, setAccessToken, unwrap } from "@/lib/api/client";

const schema = z
  .object({
    password: z.string().min(10, "10 caractères minimum").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Les mots de passe ne correspondent pas",
  });
type Values = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const errors = form.formState.errors;

  const info = useQuery({
    queryKey: ["reset-token", token],
    queryFn: () => unwrap(api.GET("/api/auth/reset/{token}", { params: { path: { token } } })),
    retry: false,
    staleTime: Infinity,
  });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await unwrap(api.POST("/api/auth/reset-password", { body: { token, password: v.password } }));
      // Toutes les sessions sont révoquées côté serveur : on oublie le jeton en mémoire.
      setAccessToken(null);
      // Rechargement complet : l'état de session de l'application repart de zéro.
      window.location.assign("/login?reset=1");
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-10">
      <Logo className="text-xl" />
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {info.isPending ? (
          <div className="space-y-3" aria-busy="true" aria-label="Vérification du lien">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : info.isError ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="size-6" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold">Lien invalide ou expiré</h1>
            <p className="text-sm text-muted-foreground">
              Ce lien de réinitialisation a déjà été utilisé ou n&apos;est plus valable. Vous pouvez en demander un
              nouveau.
            </p>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login">Se connecter</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="size-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Nouveau mot de passe</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choisissez un nouveau mot de passe pour <strong className="break-all text-foreground">{info.data.email}</strong>.
              Vous serez déconnecté de tous vos appareils.
            </p>
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className="h-11"
                  aria-invalid={!!errors.password}
                  aria-describedby="password-hint"
                  {...form.register("password")}
                />
                {errors.password ? (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                ) : (
                  <p id="password-hint" className="text-xs text-muted-foreground">
                    10 caractères minimum.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  className="h-11"
                  aria-invalid={!!errors.confirm}
                  {...form.register("confirm")}
                />
                {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
              </div>
              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="h-11 w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Enregistrer le mot de passe
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
