"use client";

import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { type Schemas, uploadFile } from "@/lib/api/client";
import { actionErrorMessage } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export type Media = Schemas["MediaOut"];
export type MediaKind = Schemas["MediaKind"];

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";
export const MAX_UPLOAD_MB = 10;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Vérification côté client (format + taille). Retourne un message d'erreur ou null. */
export function checkImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.split(",").includes(file.type)) return "Format non supporté (JPEG, PNG ou WebP).";
  if (file.size > MAX_UPLOAD_BYTES) return `Image trop lourde (${MAX_UPLOAD_MB} Mo maximum).`;
  return null;
}

/** Envoie une image dans la médiathèque du restaurant. */
export function uploadMedia(rid: string, file: File, kind: MediaKind, alt?: string): Promise<Media> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  if (alt) form.append("alt", alt);
  return uploadFile<Media>(`/api/restaurants/${rid}/media`, form);
}

/** Aperçu d'image tolérant : affiche une icône si l'image ne peut pas être chargée. */
export function ImagePreview({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <div
        className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}
        role="img"
        aria-label={src ? `${alt} (aperçu indisponible)` : `${alt} : aucune image`}
      >
        <ImageIcon className="size-6" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={cn("object-cover", className)} onError={() => setFailed(src)} />;
}

/**
 * Champ d'envoi d'une image unique (logo, couverture, photo produit).
 * L'image est envoyée immédiatement ; le parent reçoit le média créé.
 */
export function ImageUpload({
  rid,
  kind,
  label,
  description,
  previewUrl,
  onUploaded,
  onRemove,
  aspect = "square",
  disabled = false,
  readOnly = false,
  readOnlyHint,
}: {
  rid: string;
  kind: MediaKind;
  label: string;
  description?: string;
  previewUrl: string | null | undefined;
  onUploaded: (media: Media) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  aspect?: "square" | "wide";
  disabled?: boolean;
  /** Affiche l'image sans les boutons d'envoi / de retrait (pas de permission `media.manage`). */
  readOnly?: boolean;
  /** Texte affiché sous l'image en lecture seule. */
  readOnlyHint?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  const shown = localUrl ?? previewUrl ?? null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const err = checkImageFile(file);
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      const media = await uploadMedia(rid, file, kind);
      await onUploaded(media);
      // L'aperçu local reste lisible même si le stockage n'est pas accessible depuis le navigateur.
      setLocalUrl(URL.createObjectURL(file));
    } catch (e) {
      setError(actionErrorMessage(e));
      toast.error(actionErrorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!onRemove) return;
    setBusy(true);
    try {
      await onRemove();
      setLocalUrl(null);
    } catch (e) {
      toast.error(actionErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-muted/30 p-3">
        <ImagePreview
          src={shown}
          alt={label}
          className={cn(
            "shrink-0 overflow-hidden border bg-background shadow-xs",
            aspect === "wide" ? "aspect-video w-full rounded-lg sm:w-56" : "size-24 rounded-xl",
          )}
        />
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="sr-only"
              disabled={disabled || busy}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {shown ? "Remplacer" : "Choisir une image"}
            </Button>
            {shown && onRemove && (
              <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={remove}>
                <Trash2 />
                Retirer
              </Button>
            )}
          </div>
        )}
        {readOnly && !shown && <p className="text-sm text-muted-foreground">Aucune image.</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        {readOnly
          ? (readOnlyHint ?? "Vous n'avez pas la permission de modifier les images.")
          : `${description ? `${description} ` : ""}JPEG, PNG ou WebP, ${MAX_UPLOAD_MB} Mo maximum.`}
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
