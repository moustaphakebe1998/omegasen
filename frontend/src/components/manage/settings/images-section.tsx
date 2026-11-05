"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Images, Loader2, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  ACCEPTED_IMAGE_TYPES,
  checkImageFile,
  ImagePreview,
  ImageUpload,
  type Media,
  MAX_UPLOAD_MB,
  uploadMedia,
} from "@/components/manage/media/image-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, unwrap } from "@/lib/api/client";

import { ConfirmDialog } from "./confirm-dialog";
import { type Restaurant, useUpdateRestaurant } from "./use-restaurant";

function GalleryItem({ rid, media, onDelete }: { rid: string; media: Media; onDelete: () => void }) {
  const qc = useQueryClient();
  const [alt, setAlt] = useState(media.alt ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = alt !== (media.alt ?? "");
  const id = `alt-${media.id}`;

  const save = async () => {
    setSaving(true);
    try {
      await unwrap(
        api.PATCH("/api/restaurants/{restaurant_id}/media/{media_id}", {
          params: { path: { restaurant_id: rid, media_id: media.id } },
          body: { alt: alt.trim() || null },
        }),
      );
      await qc.invalidateQueries({ queryKey: ["media", rid, "GALLERY"] });
      toast.success("Description enregistrée");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="grid gap-2 rounded-md border p-2">
      <ImagePreview src={media.thumb_url} alt={media.alt ?? "Photo de la galerie"} className="aspect-[4/3] w-full rounded" />
      <Label htmlFor={id} className="text-xs">
        Description de l&apos;image
      </Label>
      <div className="flex gap-1">
        <Input
          id={id}
          value={alt}
          maxLength={255}
          placeholder="Ex. Notre terrasse"
          onChange={(e) => setAlt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) {
              e.preventDefault();
              save();
            }
          }}
        />
        <Button size="icon" variant="outline" aria-label="Enregistrer la description" disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
        </Button>
        <Button size="icon" variant="ghost" aria-label="Supprimer l'image" onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function Gallery({ rid }: { rid: string }) {
  const qc = useQueryClient();
  const key = ["media", rid, "GALLERY"];
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [toDelete, setToDelete] = useState<Media | null>(null);
  const gallery = useQuery({
    queryKey: key,
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/media", {
          params: { path: { restaurant_id: rid }, query: { kind: "GALLERY" } },
        }),
      ),
  });
  const items = [...(gallery.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const valid: File[] = [];
    for (const f of list) {
      const err = checkImageFile(f);
      if (err) toast.error(`${f.name} : ${err}`);
      else valid.push(f);
    }
    if (inputRef.current) inputRef.current.value = "";
    if (!valid.length) return;
    setProgress({ done: 0, total: valid.length });
    let ok = 0;
    for (const f of valid) {
      try {
        await uploadMedia(rid, f, "GALLERY");
        ok++;
      } catch (e) {
        toast.error(`${f.name} : ${errorMessage(e)}`);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    await qc.invalidateQueries({ queryKey: key });
    if (ok) toast.success(ok > 1 ? `${ok} images ajoutées` : "Image ajoutée");
  };

  const doDelete = async () => {
    if (!toDelete) return true;
    try {
      await unwrap(
        api.DELETE("/api/restaurants/{restaurant_id}/media/{media_id}", {
          params: { path: { restaurant_id: rid, media_id: toDelete.id } },
        }),
      );
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Image supprimée");
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Galerie</CardTitle>
        <CardDescription>Photos de l&apos;établissement et des plats affichées sur votre page publique.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            id="gallery-upload"
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES}
            className="sr-only"
            disabled={!!progress}
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button type="button" variant="outline" disabled={!!progress} onClick={() => inputRef.current?.click()}>
            {progress ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {progress ? `Envoi ${progress.done}/${progress.total}…` : "Ajouter des photos"}
          </Button>
          <label htmlFor="gallery-upload" className="text-xs text-muted-foreground">
            Plusieurs fichiers possibles · JPEG, PNG ou WebP · {MAX_UPLOAD_MB} Mo max. par image
          </label>
        </div>
        {gallery.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3]" />
          </div>
        ) : gallery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage(gallery.error)}
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            <Images className="size-6" />
            Aucune photo pour le moment.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => (
              <GalleryItem key={`${m.id}-${m.alt ?? ""}`} rid={rid} media={m} onDelete={() => setToDelete(m)} />
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        destructive
        title="Supprimer cette image ?"
        description="Elle sera retirée de la galerie et de votre page publique. Cette action est définitive."
        confirmLabel="Supprimer"
        onConfirm={doDelete}
      />
    </Card>
  );
}

export function ImagesSection({ restaurant }: { restaurant: Restaurant }) {
  const rid = restaurant.id;
  const update = useUpdateRestaurant(rid);
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Logo et couverture</CardTitle>
          <CardDescription>Le logo peut aussi être affiché au centre de votre QR Code.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <ImageUpload
            rid={rid}
            kind="LOGO"
            label="Logo"
            description="Format carré recommandé."
            previewUrl={restaurant.logo_url}
            onUploaded={async (m) => {
              await update({ logo_media_id: m.id });
              toast.success("Logo mis à jour");
            }}
            onRemove={async () => {
              await update({ logo_media_id: null });
              toast.success("Logo retiré");
            }}
          />
          <ImageUpload
            rid={rid}
            kind="COVER"
            label="Image de couverture"
            description="Format paysage recommandé (ex. 1600 × 900)."
            aspect="wide"
            previewUrl={restaurant.cover_url}
            onUploaded={async (m) => {
              await update({ cover_media_id: m.id });
              toast.success("Couverture mise à jour");
            }}
            onRemove={async () => {
              await update({ cover_media_id: null });
              toast.success("Couverture retirée");
            }}
          />
        </CardContent>
      </Card>
      <Gallery rid={rid} />
    </div>
  );
}
