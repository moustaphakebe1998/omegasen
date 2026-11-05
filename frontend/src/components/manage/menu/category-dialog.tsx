"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, unwrap } from "@/lib/api/client";
import { actionErrorMessage } from "@/lib/permissions";

import { type Category, menuKey } from "./utils";

const schema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80, "80 caractères maximum"),
  description: z.string().max(300, "300 caractères maximum"),
  is_visible: z.boolean(),
});
type Values = z.infer<typeof schema>;

function CategoryForm({
  rid,
  category,
  onOpenChange,
}: {
  rid: string;
  category: Category | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
      is_visible: category?.is_visible ?? true,
    },
  });
  const {
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const body = { name: v.name.trim(), description: v.description.trim() || null, is_visible: v.is_visible };
    try {
      if (category) {
        await unwrap(
          api.PATCH("/api/restaurants/{restaurant_id}/menu/categories/{category_id}", {
            params: { path: { restaurant_id: rid, category_id: category.id } },
            body,
          }),
        );
      } else {
        await unwrap(
          api.POST("/api/restaurants/{restaurant_id}/menu/categories", {
            params: { path: { restaurant_id: rid } },
            body,
          }),
        );
      }
      await qc.invalidateQueries({ queryKey: menuKey(rid) });
      toast.success(category ? "Catégorie mise à jour" : "Catégorie créée");
      onOpenChange(false);
    } catch (e) {
      setError(actionErrorMessage(e));
    }
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{category ? "Modifier la catégorie" : "Nouvelle catégorie"}</DialogTitle>
        <DialogDescription>Ex. Entrées, Plats, Boissons, Desserts.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="cat-name">Nom</Label>
          <Input
            id="cat-name"
            autoFocus
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "cat-name-err" : undefined}
            {...form.register("name")}
          />
          {errors.name && (
            <p id="cat-name-err" className="text-xs text-destructive" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cat-desc">Description (facultatif)</Label>
          <Textarea id="cat-desc" rows={2} aria-invalid={!!errors.description} {...form.register("description")} />
          {errors.description && (
            <p className="text-xs text-destructive" role="alert">
              {errors.description.message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Controller
            control={form.control}
            name="is_visible"
            render={({ field }) => <Switch id="cat-visible" checked={field.value} onCheckedChange={field.onChange} />}
          />
          <Label htmlFor="cat-visible">Visible sur la carte client</Label>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            {category ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function CategoryDialog({
  rid,
  category,
  open,
  onOpenChange,
}: {
  rid: string;
  category: Category | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <CategoryForm key={category?.id ?? "new"} rid={rid} category={category} onOpenChange={onOpenChange} />}
    </Dialog>
  );
}
