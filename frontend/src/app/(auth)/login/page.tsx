"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage, lastSessionBlock } from "@/lib/api/client";
import { homeFor, useAuth } from "@/lib/auth";

const schema = z.object({
  email: z.string().email("Adresse email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Email pré-rempli depuis `?email=` (liens de la page de démo), seulement s'il est valide. */
function prefillEmail(raw: string | null): string {
  const v = raw?.trim() ?? "";
  return v && schema.shape.email.safeParse(v).success ? v : "";
}

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const resetDone = params.get("reset") === "1";
  const initialEmail = prefillEmail(params.get("email"));
  // Session refusée au chargement (ex. restaurant suspendu depuis la dernière visite) : motif affiché.
  const [error, setError] = useState<string | null>(() => lastSessionBlock()?.message ?? null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail, password: "" },
  });

  useEffect(() => {
    if (!loading && user) router.replace(next ?? homeFor(user));
  }, [loading, user, next, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const u = await login(values.email, values.password);
      router.replace(next ?? homeFor(u));
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Card className="rounded-2xl shadow-md">
      <CardHeader>
        <CardTitle className="text-xl">Connexion</CardTitle>
        <CardDescription>Espace restaurateur, cuisine, caisse et administration.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          {resetDone && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/60 dark:text-green-200"
            >
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus={!initialEmail}
              className="h-11"
              aria-invalid={!!form.formState.errors.email}
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Link
                href="/mot-de-passe-oublie"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus={!!initialEmail}
              className="h-11"
              aria-invalid={!!form.formState.errors.password}
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" size="lg" className="h-11 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Se connecter
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Vous avez un restaurant ?{" "}
            <Link
              href="/demande"
              className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline"
            >
              Demander l&apos;ouverture
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            Vous êtes client ?{" "}
            <Link
              href="/inscription"
              className="font-medium whitespace-nowrap text-primary underline-offset-4 hover:underline"
            >
              Créer un compte client
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
