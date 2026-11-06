"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Download, FileText, Loader2, Printer, QrCode, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/manage/layout/permissions";
import { ConfirmDialog } from "@/components/manage/settings/confirm-dialog";
import { SectionTitle } from "@/components/manage/settings/fields";
import { useRestaurant } from "@/components/manage/settings/use-restaurant";
import { PageHeader } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage, fetchBlob, type Schemas, unwrap } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { actionErrorMessage } from "@/lib/permissions";
import { tableParam } from "@/lib/tables";
import { cn } from "@/lib/utils";

type Qr = Schemas["QrOut"];

const HEX = /^#[0-9A-Fa-f]{6}$/;

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function ColorField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const valid = HEX.test(value);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-default"
        />
        <Input
          aria-label={`${label} (code hexadécimal)`}
          disabled={disabled}
          value={value}
          maxLength={7}
          className="font-mono uppercase"
          aria-invalid={!valid}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      </div>
      {!valid && (
        <p className="text-xs text-destructive" role="alert">
          Format attendu : #RRGGBB
        </p>
      )}
    </div>
  );
}

function Customize({
  qr,
  rid,
  hasLogo,
  onSave,
  editable,
}: {
  qr: Qr;
  rid: string;
  hasLogo: boolean;
  onSave: (body: Schemas["QrUpdate"]) => Promise<void>;
  /** Permission `qr.manage` : sinon, présentation en lecture seule. */
  editable: boolean;
}) {
  const [fg, setFg] = useState(qr.foreground_color.toUpperCase());
  const [bg, setBg] = useState(qr.background_color.toUpperCase());
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const valid = HEX.test(fg) && HEX.test(bg);
  const ratio = valid ? contrastRatio(fg, bg) : 21;
  const inverted = valid && luminance(fg) > luminance(bg);
  const dirty = fg !== qr.foreground_color.toUpperCase() || bg !== qr.background_color.toUpperCase();

  const saveColors = async () => {
    setSaving(true);
    try {
      await onSave({ foreground_color: fg, background_color: bg });
      toast.success("Couleurs enregistrées");
    } catch (e) {
      toast.error(actionErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (body: Schemas["QrUpdate"], msg: string) => {
    try {
      await onSave(body);
      toast.success(msg);
      return true;
    } catch (e) {
      toast.error(actionErrorMessage(e));
      return false;
    }
  };

  return (
    <Card>
      <CardHeader>
        <SectionTitle readOnly={!editable}>Personnalisation</SectionTitle>
        <CardDescription>
          {editable
            ? "Gardez un code foncé sur fond clair pour une lecture fiable par tous les téléphones."
            : "Couleurs et options actuelles du QR Code. Les téléchargements restent disponibles."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField id="qr-fg" label="Couleur du code" value={fg} onChange={setFg} disabled={!editable} />
          <ColorField id="qr-bg" label="Couleur du fond" value={bg} onChange={setBg} disabled={!editable} />
        </div>
        {editable && valid && (ratio < 4.5 || inverted) && (
          <p
            className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            role="status"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {inverted
              ? "Le code est plus clair que le fond : certains téléphones ne pourront pas le lire."
              : `Contraste faible (${ratio.toFixed(1)}:1) : le QR Code risque d'être difficile à scanner. Visez au moins 4,5:1.`}
          </p>
        )}
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveColors} disabled={!valid || !dirty || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Enregistrer les couleurs
            </Button>
            <Button
              variant="ghost"
              disabled={!dirty || saving}
              onClick={() => {
                setFg(qr.foreground_color.toUpperCase());
                setBg(qr.background_color.toUpperCase());
              }}
            >
              Annuler
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setFg("#111827");
                setBg("#FFFFFF");
              }}
            >
              <RefreshCw />
              Couleurs par défaut
            </Button>
          </div>
        )}

        <div className="flex items-start gap-3 rounded-md border p-3">
          <Switch
            id="qr-logo"
            checked={qr.with_logo}
            disabled={!editable}
            onCheckedChange={(v) => toggle({ with_logo: v }, v ? "Logo affiché au centre" : "Logo retiré")}
            aria-describedby="qr-logo-hint"
          />
          <div className="grid gap-0.5">
            <Label htmlFor="qr-logo">Afficher le logo au centre</Label>
            <p id="qr-logo-hint" className="text-xs text-muted-foreground">
              {hasLogo ? (
                "Le logo de votre établissement est placé au centre du code."
              ) : (
                <>
                  Aucun logo défini : ajoutez-le dans{" "}
                  <Link href={`/manage/${rid}/settings`} className="underline">
                    Établissement
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-md border p-3">
          <Switch
            id="qr-active"
            checked={qr.is_active}
            disabled={!editable}
            onCheckedChange={(v) => (v ? toggle({ is_active: true }, "QR Code réactivé") : setConfirmOff(true))}
            aria-describedby="qr-active-hint"
          />
          <div className="grid gap-0.5">
            <Label htmlFor="qr-active">QR Code actif</Label>
            <p id="qr-active-hint" className="text-xs text-muted-foreground">
              Désactivé, le QR Code affiche aux clients que la commande n&apos;est pas disponible.
            </p>
          </div>
        </div>

        <ConfirmDialog
          open={confirmOff}
          onOpenChange={setConfirmOff}
          destructive
          title="Désactiver le QR Code ?"
          description="Les clients qui le scanneront verront que la commande en ligne est indisponible. Vous pourrez le réactiver à tout moment ; le code imprimé reste le même."
          confirmLabel="Désactiver"
          onConfirm={() => toggle({ is_active: false }, "QR Code désactivé")}
        />
      </CardContent>
    </Card>
  );
}

export function QrManager({ rid }: { rid: string }) {
  const qc = useQueryClient();
  const restaurant = useRestaurant(rid);
  const can = useCan(rid);
  const qr = useQuery({
    queryKey: ["qr", rid],
    queryFn: () => unwrap(api.GET("/api/restaurants/{restaurant_id}/qr", { params: { path: { restaurant_id: rid } } })),
  });
  const base = `/api/restaurants/${rid}/qr`;
  const slug = restaurant.data?.slug ?? "restaurant";

  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [table, setTable] = useState("");
  const tableLabel = tableParam(table.trim());
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<string | null>(null);

  const d = qr.data;
  const sig = d
    ? [
        d.foreground_color,
        d.background_color,
        d.with_logo,
        d.is_active,
        d.regenerated_at,
        restaurant.data?.logo_media_id,
      ].join("|")
    : null;

  useEffect(() => {
    if (!sig) return;
    let cancelled = false;
    setPreviewError(null);
    fetchBlob(`${base}/image.png?size=1024&v=${encodeURIComponent(sig)}`)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = url;
        setPreview(url);
      })
      .catch((e) => !cancelled && setPreviewError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [base, sig]);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const save = async (body: Schemas["QrUpdate"]) => {
    const data = await unwrap(
      api.PATCH("/api/restaurants/{restaurant_id}/qr", { params: { path: { restaurant_id: rid } }, body }),
    );
    qc.setQueryData(["qr", rid], data);
  };

  const download = async (key: string, path: string, filename: string) => {
    setBusy(key);
    try {
      saveBlob(await fetchBlob(`${base}/${path}`), filename);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    // Ouverture synchrone (évite le bloqueur de fenêtres), contenu chargé ensuite.
    const win = window.open("", "_blank");
    setBusy("print");
    try {
      const blob = await fetchBlob(`${base}/print.pdf?page=A4`);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else saveBlob(blob, `affiche-qr-${slug}-A4.pdf`);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      win?.close();
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!d) return;
    try {
      await navigator.clipboard.writeText(d.url);
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible : sélectionnez le lien manuellement.");
    }
  };

  const spin = (k: string, Icon: React.ComponentType) => (busy === k ? <Loader2 className="animate-spin" /> : <Icon />);

  return (
    <>
      <PageHeader
        title="QR Code"
        description="Le QR Code unique et permanent de votre établissement, à imprimer sur vos tables, comptoir et vitrine."
      />
      {qr.isPending ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : qr.isError || !d ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {errorMessage(qr.error)}{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => qr.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="grid content-start gap-4">
            <Card className="gap-0 overflow-hidden py-0">
              <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-6 pb-5 text-center">
                <p className="truncate text-sm font-semibold">{restaurant.data?.name}</p>
                <p className="text-xs text-muted-foreground">Scannez pour voir le menu et commander</p>
              </div>
              <CardContent className="grid gap-4 px-6 pb-6">
                <div className="relative mx-auto -mt-1 aspect-square w-full max-w-72 overflow-hidden rounded-2xl border bg-white p-3 shadow-md ring-1 ring-black/5">
                  {preview ? (
                    <img src={preview} alt="Aperçu du QR Code" className="size-full object-contain" />
                  ) : previewError ? (
                    <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                      <QrCode className="size-8" />
                      {previewError}
                    </div>
                  ) : (
                    <Skeleton className="size-full" />
                  )}
                  {!d.is_active && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Badge variant="destructive">Désactivé</Badge>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Badge
                    variant={d.is_active ? "default" : "destructive"}
                    className={cn(
                      d.is_active &&
                        "border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
                    )}
                  >
                    {d.is_active ? "Actif" : "Désactivé"}
                  </Badge>
                  <Badge variant="outline" className="font-mono">
                    {d.code}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Télécharger et imprimer</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button
                  variant="outline"
                  className="justify-start"
                  disabled={!!busy}
                  onClick={() => download("png", "image.png?size=2048&download=true", `qr-${slug}.png`)}
                >
                  {spin("png", Download)}
                  Image PNG (haute définition)
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  disabled={!!busy}
                  onClick={() => download("svg", "image.svg", `qr-${slug}.svg`)}
                >
                  {spin("svg", Download)}
                  Image SVG (vectorielle)
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  disabled={!!busy}
                  onClick={() => download("a4", "print.pdf?page=A4", `affiche-qr-${slug}-A4.pdf`)}
                >
                  {spin("a4", FileText)}
                  Affiche A4 (PDF)
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  disabled={!!busy}
                  onClick={() => download("a6", "print.pdf?page=A6", `chevalet-qr-${slug}-A6.pdf`)}
                >
                  {spin("a6", FileText)}
                  Chevalet de table A6 (PDF)
                </Button>
                <Button className="mt-1" disabled={!!busy} onClick={print}>
                  {spin("print", Printer)}
                  Imprimer l&apos;affiche
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>QR Code d&apos;une table</CardTitle>
                <CardDescription>
                  Même code permanent, avec la table en plus : le client qui le scanne commande sur place et sa table
                  est déjà renseignée.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qr-table">Table</Label>
                  <Input
                    id="qr-table"
                    placeholder="ex. T5"
                    maxLength={20}
                    value={table}
                    onChange={(e) => setTable(e.target.value)}
                    aria-invalid={table.trim() !== "" && !tableLabel}
                    aria-describedby="qr-table-help"
                  />
                  <p id="qr-table-help" className="text-xs text-muted-foreground">
                    Lettres, chiffres, « - » ou « _ » (20 caractères maximum).
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="justify-start"
                  disabled={!!busy || !tableLabel}
                  onClick={() =>
                    tableLabel &&
                    download(
                      "table-a6",
                      `print.pdf?page=A6&table=${encodeURIComponent(tableLabel)}`,
                      `chevalet-qr-${slug}-table-${tableLabel}.pdf`,
                    )
                  }
                >
                  {spin("table-a6", FileText)}
                  Chevalet de table A6 (PDF)
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  disabled={!!busy || !tableLabel}
                  onClick={() =>
                    tableLabel &&
                    download(
                      "table-png",
                      `image.png?size=2048&download=true&table=${encodeURIComponent(tableLabel)}`,
                      `qr-${slug}-table-${tableLabel}.png`,
                    )
                  }
                >
                  {spin("table-png", Download)}
                  QR Code de la table (PNG)
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="grid content-start gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Lien encodé</CardTitle>
                <CardDescription>
                  Ce QR Code ne change jamais, même si vous modifiez votre carte, le nom ou l&apos;adresse de votre page
                  : vos supports imprimés restent valables.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex gap-2">
                  <Label htmlFor="qr-url" className="sr-only">
                    Lien du QR Code
                  </Label>
                  <Input
                    id="qr-url"
                    readOnly
                    value={d.url}
                    className="font-mono text-xs"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button variant="outline" onClick={copy} aria-label="Copier le lien">
                    {copied ? <Check /> : <Copy />}
                    <span className="hidden sm:inline">Copier</span>
                  </Button>
                </div>
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3 sm:gap-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3 sm:block">
                    <dt className="text-muted-foreground">Scans</dt>
                    <dd className="text-xl font-semibold tabular-nums">{d.scan_count.toLocaleString("fr-FR")}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3 sm:block">
                    <dt className="text-muted-foreground">Dernier scan</dt>
                    <dd className="font-medium">{d.last_scanned_at ? formatDateTime(d.last_scanned_at) : "Jamais"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3 sm:block">
                    <dt className="text-muted-foreground">Créé le</dt>
                    <dd className="font-medium">{formatDateTime(d.created_at)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Customize
              key={`${d.foreground_color}|${d.background_color}`}
              qr={d}
              rid={rid}
              hasLogo={!!restaurant.data?.logo_media_id}
              onSave={save}
              editable={can("qr.manage")}
            />
          </div>
        </div>
      )}
    </>
  );
}
