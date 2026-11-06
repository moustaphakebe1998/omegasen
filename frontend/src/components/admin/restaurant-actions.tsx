"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { adminErrorMessage, RESTAURANT_STATUS, type RestaurantStatus } from "@/components/admin/status";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage, unwrap } from "@/lib/api/client";

/** Changement de statut d'un restaurant (liste et fiche). */
export function useSetRestaurantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: RestaurantStatus; reason?: string }) =>
      unwrap(
        api.POST("/api/admin/restaurants/{restaurant_id}/status", {
          params: { path: { restaurant_id: id } },
          body: { status, reason: reason ?? null },
        }),
      ),
    onSuccess: (r) => {
      toast.success(`${r.name} : ${RESTAURANT_STATUS[r.status].label.toLowerCase()}`);
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(adminErrorMessage(e)),
  });
}

/** Confirmation renforcée avant de régénérer le QR Code (les supports imprimés cessent de fonctionner). */
export function RegenerateQrDialog({
  restaurant: r,
  onClose,
}: {
  restaurant: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [understood, setUnderstood] = useState(false);
  useEffect(() => setUnderstood(false), [r?.id]);

  const regenerate = useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/api/admin/restaurants/{restaurant_id}/qr/regenerate", { params: { path: { restaurant_id: id } } }),
      ),
    onSuccess: (qr) => {
      toast.success(`Nouveau QR Code généré pour ${r?.name} (${qr.code})`);
      void qc.invalidateQueries({ queryKey: ["admin", "restaurants"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <AlertDialog open={r !== null} onOpenChange={(o) => !o && !regenerate.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Régénérer le QR Code de {r?.name} ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Un nouveau code sera créé et <strong>l&apos;ancien cessera immédiatement de fonctionner</strong> : tous
                les QR Codes déjà imprimés (tables, vitrine, flyers) ne mèneront plus au restaurant.
              </p>
              <p>Le restaurateur devra réimprimer et remplacer tous ses supports. Cette action est irréversible.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <Checkbox id="qr-understood" checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} />
          <Label htmlFor="qr-understood" className="text-sm leading-snug font-normal">
            Je comprends que les QR Codes imprimés de ce restaurant ne fonctionneront plus.
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={regenerate.isPending}>Annuler</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!understood || regenerate.isPending}
            onClick={() => r && regenerate.mutate(r.id)}
          >
            {regenerate.isPending && <Loader2 className="animate-spin" />}
            Régénérer le QR Code
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Suppression sécurisée d'un restaurant FERMÉ : saisie de son adresse et motif. Suppression logique côté
 * serveur (commandes, paiements et journal conservés).
 */
export function DeleteRestaurantDialog({
  restaurant: r,
  open,
  onOpenChange,
  onDeleted,
}: {
  restaurant: { id: string; name: string; slug: string };
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [slug, setSlug] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    setSlug("");
    setReason("");
  }, [open]);
  const del = useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE("/api/admin/restaurants/{restaurant_id}", {
          params: { path: { restaurant_id: r.id } },
          body: { confirm_slug: slug.trim(), reason: reason.trim() },
        }),
      ),
    onSuccess: () => {
      toast.success(`${r.name} supprimé`);
      void qc.invalidateQueries({ queryKey: ["admin"] });
      onDeleted();
    },
    onError: (e) => toast.error(adminErrorMessage(e)),
  });
  const ok = slug.trim() === r.slug && reason.trim().length >= 3;
  return (
    <AlertDialog open={open} onOpenChange={(o) => !del.isPending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer {r.name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Le restaurant disparaît de la plateforme et son équipe perd définitivement l&apos;accès. Les commandes,
            paiements et le journal d&apos;activité sont conservés.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="del-slug">
              Saisissez <strong className="font-mono">{r.slug}</strong> pour confirmer
            </Label>
            <Input id="del-slug" value={slug} onChange={(e) => setSlug(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="del-reason">Motif</Label>
            <Input id="del-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Annuler</AlertDialogCancel>
          <Button variant="destructive" disabled={!ok || del.isPending} onClick={() => del.mutate()}>
            {del.isPending && <Loader2 className="animate-spin" />}
            Supprimer définitivement
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
