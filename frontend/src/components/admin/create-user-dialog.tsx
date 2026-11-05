"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ActivationResult } from "@/components/admin/activation-link";
import { adminErrorMessage, ROLES, roleLabel } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api, type Schemas, unwrap } from "@/lib/api/client";

const NONE = "__none__";

/** Tous les restaurants (pour les sélecteurs de rattachement / filtres). */
export function useAdminRestaurants() {
  return useQuery({
    queryKey: ["admin", "restaurants", "all"],
    queryFn: () => unwrap(api.GET("/api/admin/restaurants", { params: { query: { page_size: 200 } } })),
    staleTime: 60_000,
  });
}

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Nom trop court").max(120, "Nom trop long"),
    email: z.string().trim().email("Adresse email invalide"),
    phone: z.string().trim().max(32, "Numéro trop long").optional(),
    restaurant_id: z.string(),
    role: z.enum(["OWNER", "MANAGER", "CASHIER", "KITCHEN", NONE]),
    is_superadmin: z.boolean(),
  })
  .refine((v) => (v.restaurant_id === NONE) === (v.role === NONE), {
    path: ["role"],
    message: "Choisissez à la fois le restaurant et le rôle",
  });
type Values = z.infer<typeof schema>;

export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const restaurants = useAdminRestaurants();
  const [created, setCreated] = useState<Schemas["AdminUser"] | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", phone: "", restaurant_id: NONE, role: NONE, is_superadmin: false },
  });
  const errors = form.formState.errors;
  const submitting = form.formState.isSubmitting;
  const superadmin = form.watch("is_superadmin");
  const restaurantId = form.watch("restaurant_id");

  useEffect(() => {
    if (!open) {
      form.reset();
      setCreated(null);
    }
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const u = await unwrap(
        api.POST("/api/admin/users", {
          body: {
            full_name: v.full_name.trim(),
            email: v.email.trim().toLowerCase(),
            phone: v.phone?.trim() || null,
            is_superadmin: v.is_superadmin,
            restaurant_id: v.restaurant_id === NONE ? null : v.restaurant_id,
            role: v.role === NONE ? null : v.role,
          },
        }),
      );
      toast.success(`Compte créé pour ${u.full_name}`);
      setCreated(u);
      void qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      const msg = adminErrorMessage(e);
      if (e instanceof ApiError && e.code === "email_taken") form.setError("email", { message: msg });
      toast.error(msg);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{created ? "Utilisateur créé" : "Créer un utilisateur"}</DialogTitle>
          <DialogDescription>
            {created
              ? "Le compte reste « en attente d'activation » jusqu'à ce que la personne choisisse son mot de passe."
              : "Aucun mot de passe provisoire : la personne reçoit un lien d'activation pour choisir elle-même son mot de passe."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <ActivationResult url={created.activation_url} email={created.email} emailSent={created.email_sent} />
        ) : (
          <form id="admin-create-user" onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="cu-name">Nom complet</Label>
              <Input
                id="cu-name"
                autoComplete="off"
                {...form.register("full_name")}
                aria-invalid={!!errors.full_name}
              />
              {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cu-email">Email</Label>
                <Input
                  id="cu-email"
                  type="email"
                  autoComplete="off"
                  {...form.register("email")}
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cu-phone">Téléphone (facultatif)</Label>
                <Input id="cu-phone" type="tel" autoComplete="off" {...form.register("phone")} />
                {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
              </div>
            </div>

            <fieldset className="space-y-4 rounded-xl border p-4">
              <legend className="px-1 text-sm font-semibold">Rattachement à un restaurant (facultatif)</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cu-restaurant">Restaurant</Label>
                  <Controller
                    control={form.control}
                    name="restaurant_id"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          if (v === NONE) form.setValue("role", NONE);
                        }}
                      >
                        <SelectTrigger id="cu-restaurant" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Aucun</SelectItem>
                          {restaurants.data?.items.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cu-role">Rôle</Label>
                  <Controller
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={restaurantId === NONE}>
                        <SelectTrigger id="cu-role" className="w-full" aria-invalid={!!errors.role}>
                          <SelectValue placeholder="Choisir un rôle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Choisir un rôle</SelectItem>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabel(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
            </fieldset>

            <div className="space-y-2 rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <Controller
                  control={form.control}
                  name="is_superadmin"
                  render={({ field }) => (
                    <Checkbox
                      id="cu-superadmin"
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                  )}
                />
                <Label htmlFor="cu-superadmin" className="leading-snug">
                  Super admin de la plateforme
                </Label>
              </div>
              {superadmin && (
                <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Accès complet à OmegaSen : tous les restaurants, comptes, chiffres d&apos;affaires et réglages. À
                  réserver à l&apos;équipe OmegaSen.
                </p>
              )}
            </div>
          </form>
        )}

        <DialogFooter>
          {created ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/admin/users/${created.id}`}>Voir la fiche</Link>
              </Button>
              <Button onClick={() => onOpenChange(false)}>Terminé</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Annuler
              </Button>
              <Button type="submit" form="admin-create-user" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                Créer l&apos;utilisateur
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
