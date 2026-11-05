"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Indiquez votre nom"),
    email: z.string().email("Adresse email invalide"),
    phone: z.string().trim().max(32).optional(),
    password: z.string().min(10, "10 caractères minimum"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Les mots de passe ne correspondent pas" });

type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async ({ phone, full_name, email, password }) => {
    setError(null);
    try {
      await signUp({ full_name, email, password, phone: phone || undefined });
      router.replace("/manage?new=1");
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const field = (name: keyof Values, label: string, type = "text", autoComplete?: string) => (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={type} autoComplete={autoComplete} {...form.register(name)} />
      {errors[name] && <p className="text-sm text-destructive">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un compte restaurateur</CardTitle>
        <CardDescription>Vous pourrez ensuite créer votre restaurant et son QR Code.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          {field("full_name", "Nom complet", "text", "name")}
          {field("email", "Email", "email", "email")}
          {field("phone", "Téléphone (facultatif)", "tel", "tel")}
          {field("password", "Mot de passe", "password", "new-password")}
          {field("confirm", "Confirmer le mot de passe", "password", "new-password")}
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Créer mon compte
          </Button>
          <p className="text-sm text-muted-foreground">
            Déjà inscrit ?{" "}
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Se connecter
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
