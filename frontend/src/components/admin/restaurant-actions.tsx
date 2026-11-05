"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { RESTAURANT_STATUS, type RestaurantStatus } from "@/components/admin/status";
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
import { Label } from "@/components/ui/label";
import { api, errorMessage, unwrap } from "@/lib/api/client";

/** Changement de statut d'un restaurant (liste et fiche). */
export function useSetRestaurantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RestaurantStatus }) =>
      unwrap(
        api.POST("/api/admin/restaurants/{restaurant_id}/status", {
          params: { path: { restaurant_id: id } },
          body: { status },
        }),
      ),
    onSuccess: (r) => {
      toast.success(`${r.name} : ${RESTAURANT_STATUS[r.status].label.toLowerCase()}`);
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
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
