"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api, errorMessage, unwrap } from "@/lib/api/client";

const schema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120, "Nom trop long"),
  currency: z.enum(["XOF", "EUR"]),
  city: z.string().trim().max(120).optional(),
  owner_email: z.string().trim().email("Adresse email invalide"),
  owner_full_name: z.string().trim().max(120).optional(),
  owner_password: z
    .string()
    .max(200)
    .optional()
    .refine((v) => !v || v.length >= 10, "10 caractères minimum"),
});
type Values = z.infer<typeof schema>;

const orNull = (v?: string) => (v && v.trim() ? v.trim() : null);

export function AdminCreateRestaurantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [needsOwnerDetails, setNeedsOwnerDetails] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", currency: "XOF", city: "", owner_email: "", owner_full_name: "", owner_password: "" },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (!open) {
      form.reset();
      setNeedsOwnerDetails(false);
    }
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    setSubmitting(true);
    try {
      const r = await unwrap(
        api.POST("/api/admin/restaurants", {
          body: {
            name: v.name,
            currency: v.currency,
            city: orNull(v.city),
            owner_email: v.owner_email.trim().toLowerCase(),
            owner_full_name: orNull(v.owner_full_name),
            owner_password: orNull(v.owner_password),
          },
        }),
      );
      toast.success(`Restaurant « ${r.name} » créé`);
      void qc.invalidateQueries({ queryKey: ["admin"] });
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "owner_details_required") {
        setNeedsOwnerDetails(true);
        form.setError("owner_full_name", { message: "Requis pour un nouveau compte" });
        form.setError("owner_password", { message: "Requis pour un nouveau compte" });
      }
      toast.error(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer un restaurant</DialogTitle>
          <DialogDescription>
            Le restaurant est rattaché à un propriétaire. Si l&apos;email ne correspond à aucun compte, un compte est créé
            avec le nom et le mot de passe indiqués.
          </DialogDescription>
        </DialogHeader>
        <form id="admin-create-restaurant" onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="acr-name">Nom du restaurant</Label>
            <Input id="acr-name" {...form.register("name")} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="acr-currency">Devise</Label>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="acr-currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="XOF">Franc CFA (XOF)</SelectItem>
                      <SelectItem value="EUR">Euro (EUR)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acr-city">Ville</Label>
              <Input id="acr-city" {...form.register("city")} />
            </div>
          </div>
          <fieldset className="space-y-4 rounded-lg border p-4">
            <legend className="px-1 text-sm font-semibold">Propriétaire</legend>
            <div className="space-y-1.5">
              <Label htmlFor="acr-owner-email">Email</Label>
              <Input
                id="acr-owner-email"
                type="email"
                autoComplete="off"
                {...form.register("owner_email")}
                aria-invalid={!!errors.owner_email}
              />
              {errors.owner_email && <p className="text-sm text-destructive">{errors.owner_email.message}</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              {needsOwnerDetails
                ? "Aucun compte n'existe pour cet email : renseignez le nom et un mot de passe provisoire."
                : "Nom et mot de passe : uniquement si le propriétaire n'a pas encore de compte."}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="acr-owner-name">Nom complet</Label>
              <Input id="acr-owner-name" {...form.register("owner_full_name")} aria-invalid={!!errors.owner_full_name} />
              {errors.owner_full_name && <p className="text-sm text-destructive">{errors.owner_full_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acr-owner-password">Mot de passe provisoire</Label>
              <Input
                id="acr-owner-password"
                type="password"
                autoComplete="new-password"
                {...form.register("owner_password")}
                aria-invalid={!!errors.owner_password}
              />
              {errors.owner_password && <p className="text-sm text-destructive">{errors.owner_password.message}</p>}
            </div>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button type="submit" form="admin-create-restaurant" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Créer le restaurant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
