"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChefHat, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api/client";

import { ConfirmDialog } from "./confirm-dialog";
import { useStations } from "./use-restaurant";

const nameSchema = z.string().trim().min(1, "Nom requis").max(60, "60 caractères maximum");

export function StationsSection({ rid }: { rid: string }) {
  const qc = useQueryClient();
  const stations = useStations(rid);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Schemas["StationOut"] | null>(null);
  const list = [...(stations.data ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nom invalide");
      return;
    }
    if (list.some((s) => s.name.toLowerCase() === parsed.data.toLowerCase())) {
      setError("Ce poste existe déjà");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await unwrap(
        api.POST("/api/restaurants/{restaurant_id}/stations", {
          params: { path: { restaurant_id: rid } },
          body: { name: parsed.data, sort_order: list.length },
        }),
      );
      await qc.invalidateQueries({ queryKey: ["stations", rid] });
      setName("");
      toast.success("Poste ajouté");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!toDelete) return true;
    try {
      await unwrap(
        api.DELETE("/api/restaurants/{restaurant_id}/stations/{station_id}", {
          params: { path: { restaurant_id: rid, station_id: toDelete.id } },
        }),
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["stations", rid] }),
        qc.invalidateQueries({ queryKey: ["menu", rid] }),
      ]);
      toast.success("Poste supprimé");
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Postes de cuisine</CardTitle>
        <CardDescription>
          Ex. Grill, Bar, Pâtisserie. Chaque produit peut être rattaché à un poste pour filtrer l&apos;écran cuisine.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={create} noValidate className="grid gap-1.5">
          <Label htmlFor="station-name">Nouveau poste</Label>
          <div className="flex gap-2">
            <Input
              id="station-name"
              value={name}
              maxLength={60}
              placeholder="Nom du poste"
              aria-invalid={!!error}
              aria-describedby={error ? "station-name-err" : undefined}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              Ajouter
            </Button>
          </div>
          {error && (
            <p id="station-name-err" className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>
        {stations.isPending ? (
          <Skeleton className="h-20" />
        ) : stations.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage(stations.error)}
          </p>
        ) : list.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ChefHat className="size-4" />
            Aucun poste : toutes les commandes s&apos;affichent sur un écran cuisine unique.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {list.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium">{s.name}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Supprimer le poste ${s.name}`} onClick={() => setToDelete(s)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        destructive
        title={`Supprimer le poste « ${toDelete?.name ?? ""} » ?`}
        description="Les produits rattachés à ce poste n'en auront plus ; pensez à les réaffecter dans la carte."
        confirmLabel="Supprimer"
        onConfirm={doDelete}
      />
    </Card>
  );
}
