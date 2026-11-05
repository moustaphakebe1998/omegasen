"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(120, "Nom trop long"),
  currency: z.enum(["EUR", "XOF"]),
  city: z.string().trim().max(120).optional(),
  address_line: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(32).optional(),
});
type Values = z.infer<typeof schema>;

const orNull = (v?: string) => (v && v.length ? v : null);

export function CreateRestaurantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reload } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", currency: "XOF", city: "", address_line: "", phone: "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    setSubmitting(true);
    try {
      const r = await unwrap(
        api.POST("/api/restaurants", {
          body: {
            name: v.name,
            currency: v.currency,
            city: orNull(v.city),
            address_line: orNull(v.address_line),
            phone: orNull(v.phone),
          },
        }),
      );
      await reload();
      toast.success("Restaurant créé — votre QR Code est prêt");
      onOpenChange(false);
      form.reset();
      router.push(`/manage/${r.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un restaurant</DialogTitle>
          <DialogDescription>
            Un QR Code permanent est généré automatiquement : vous pourrez l&apos;imprimer dès la création.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cr-name">Nom du restaurant</Label>
            <Input id="cr-name" autoFocus aria-invalid={!!errors.name} {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-currency">Devise</Label>
            <Controller
              control={form.control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="cr-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XOF">Franc CFA</SelectItem>
                    <SelectItem value="EUR">Euro (€)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cr-city">Ville</Label>
              <Input id="cr-city" autoComplete="address-level2" {...form.register("city")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cr-phone">Téléphone</Label>
              <Input id="cr-phone" type="tel" autoComplete="tel" {...form.register("phone")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cr-address">Adresse</Label>
            <Input id="cr-address" autoComplete="street-address" {...form.register("address_line")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
