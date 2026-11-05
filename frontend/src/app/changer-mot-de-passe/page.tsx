"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PasswordStrength } from "@/components/manage/team/team-ui";
import { Logo } from "@/components/shared/app-shell";
import { RequireAuth } from "@/components/shared/guards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorMessage, unwrap } from "@/lib/api/client";
import { homeFor, useAuth } from "@/lib/auth";

const schema = z
  .object({
    current: z.string().min(1, "Saisissez votre mot de passe actuel"),
    password: z.string().min(10, "10 caractères minimum").max(200, "200 caractères maximum"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Les mots de passe ne correspondent pas" })
  .refine((v) => v.password !== v.current, {
    path: ["password"],
    message: "Le nouveau mot de passe doit être différent de l'actuel",
  });
type Values = z.infer<typeof schema>;

function message(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "invalid_password") return "Mot de passe actuel incorrect.";
    if (e.code === "same_password") return "Le nouveau mot de passe doit être différent de l'actuel.";
  }
  return errorMessage(e);
}

function ChangePasswordForm() {
  const { user, reload, logout } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const forced = !!user?.must_change_password;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current: "", password: "", confirm: "" },
  });
  const errors = form.formState.errors;
  const password = form.watch("password");

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await unwrap(
        api.POST("/api/auth/change-password", { body: { current_password: v.current, new_password: v.password } }),
      );
      const me = await reload();
      router.replace(homeFor(me));
    } catch (e) {
      setError(message(e));
    }
  });

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/30 p-4">
      <Logo className="text-xl" />
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          {forced ? "Choisissez votre mot de passe" : "Changer de mot de passe"}
        </h1>
        {forced ? (
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            <p>
              Bienvenue {user?.full_name}. Votre compte a été créé par votre restaurant avec un mot de passe initial :
              pour votre sécurité, remplacez-le par un mot de passe personnel que vous seul·e connaissez.
            </p>
            <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Vous accéderez à votre espace dès que ce sera fait.
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Compte {user?.email}</p>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <input type="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
          <div className="space-y-1.5">
            <Label htmlFor="current">{forced ? "Mot de passe initial" : "Mot de passe actuel"}</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              autoFocus
              aria-invalid={!!errors.current}
              {...form.register("current")}
            />
            {errors.current && <p className="text-sm text-destructive">{errors.current.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby="new-password-hint"
              {...form.register("password")}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            <PasswordStrength password={password} id="new-password-hint" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
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
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Enregistrer mon mot de passe
          </Button>
        </form>
        <Button variant="ghost" size="sm" className="mt-4 w-full text-muted-foreground" onClick={() => logout()}>
          <LogOut aria-hidden />
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <RequireAuth>
      <ChangePasswordForm />
    </RequireAuth>
  );
}
