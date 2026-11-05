"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { homeFor, useAuth } from "@/lib/auth";

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

export default function ActivatePage() {
  const { token } = useParams<{ token: string }>();
  const { activate } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });
  const errors = form.formState.errors;

  const info = useQuery({
    queryKey: ["activation", token],
    queryFn: () =>
      unwrap(
        api.GET("/api/auth/activation/{token}", {
          params: { path: { token } },
        }),
      ),
    retry: false,
  });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const user = await activate(token, v.password);
      router.replace(homeFor(user));
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/30 p-4">
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
              Ce lien d&apos;activation a déjà été utilisé ou n&apos;est plus valable (7 jours). Demandez un nouveau
              lien à l&apos;équipe OmegaSen, ou connectez-vous si votre compte est déjà activé.
            </p>
            <Button asChild variant="outline">
              <Link href="/login">Se connecter</Link>
            </Button>
          </div>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="size-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Bienvenue {info.data.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choisissez le mot de passe de votre compte <strong>{info.data.email}</strong>.
            </p>
            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...form.register("password")}
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
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
              <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Activer mon compte
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
