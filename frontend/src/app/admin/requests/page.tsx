"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Inbox, Loader2, Mail, MapPin, Phone, UtensilsCrossed, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ActivationLink } from "@/components/admin/activation-link";
import { PAGE_SIZE, Pagination } from "@/components/admin/common";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Req = Schemas["RequestOut"];
type Status = Schemas["RequestStatus"];
type Approved = Schemas["ApproveOut"];

const FILTERS: { value: Status | "ALL"; label: string }[] = [
  { value: "PENDING", label: "En attente" },
  { value: "APPROVED", label: "Acceptées" },
  { value: "REJECTED", label: "Refusées" },
  { value: "ALL", label: "Toutes" },
];

const STATUS_BADGE: Record<Status, { label: string; className: string }> = {
  PENDING: {
    label: "En attente",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  APPROVED: {
    label: "Acceptée",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  },
  REJECTED: {
    label: "Refusée",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
};

export default function AdminRequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Status | "ALL">("PENDING");
  const [page, setPage] = useState(1);
  const [approving, setApproving] = useState<Req | null>(null);
  const [rejecting, setRejecting] = useState<Req | null>(null);

  const list = useQuery({
    queryKey: ["admin", "requests", filter, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/admin/restaurant-requests", {
          params: {
            query: {
              status: filter === "ALL" ? undefined : filter,
              page,
              page_size: PAGE_SIZE,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin"] });

  return (
    <>
      <PageHeader
        title="Demandes d'ouverture"
        description="Les restaurateurs demandent l'ouverture de leur restaurant ; vous créez le restaurant en l'acceptant."
      />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les demandes">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => {
              setFilter(f.value);
              setPage(1);
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              filter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {f.label}
            {f.value === "PENDING" && (list.data?.pending ?? 0) > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular",
                  filter === f.value ? "bg-white/25" : "bg-primary/10 text-primary",
                )}
              >
                {list.data?.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Chargement des demandes">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : list.isError ? (
        <p className="text-destructive">{errorMessage(list.error)}</p>
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Aucune demande"
          description={
            filter === "PENDING" ? "Aucune demande en attente de traitement." : "Rien à afficher pour ce filtre."
          }
        />
      ) : (
        <>
          <ul className={cn("grid gap-4 lg:grid-cols-2", list.isPlaceholderData && "opacity-60")}>
            {list.data.items.map((r) => (
              <RequestCard key={r.id} req={r} onApprove={() => setApproving(r)} onReject={() => setRejecting(r)} />
            ))}
          </ul>
          <Pagination page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      <ApproveDialog req={approving} onClose={() => setApproving(null)} onDone={refresh} />
      <RejectDialog req={rejecting} onClose={() => setRejecting(null)} onDone={refresh} />
    </>
  );
}

function RequestCard({ req: r, onApprove, onReject }: { req: Req; onApprove: () => void; onReject: () => void }) {
  const badge = STATUS_BADGE[r.status];
  return (
    <li className="flex flex-col rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{r.restaurant_name}</h2>
          <p className="text-sm text-muted-foreground">
            {r.contact_name} · reçue le {formatDateTime(r.created_at)}
          </p>
        </div>
        <Badge className={cn("shrink-0 border-transparent", badge.className)}>{badge.label}</Badge>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Email</dt>
          <dd className="truncate">
            <a href={`mailto:${r.email}`} className="hover:underline">
              {r.email}
            </a>
          </dd>
        </div>
        {r.phone && (
          <div className="flex items-center gap-2">
            <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="sr-only">Téléphone</dt>
            <dd>{r.phone}</dd>
          </div>
        )}
        {r.city && (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="sr-only">Ville</dt>
            <dd>{r.city}</dd>
          </div>
        )}
        {r.cuisine && (
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dt className="sr-only">Cuisine</dt>
            <dd>{r.cuisine}</dd>
          </div>
        )}
      </dl>

      {r.message && (
        <p className="mt-4 rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-line break-words">{r.message}</p>
      )}
      {r.review_note && (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Note : </span>
          {r.review_note}
        </p>
      )}

      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-4">
        {r.status === "PENDING" ? (
          <>
            <Button variant="outline" onClick={onReject}>
              <X aria-hidden /> Refuser
            </Button>
            <Button onClick={onApprove}>
              <Check aria-hidden /> Accepter et créer
            </Button>
          </>
        ) : (
          r.restaurant_id && (
            <Button asChild variant="outline">
              <Link href={`/manage/${r.restaurant_id}`}>
                <ExternalLink aria-hidden /> Voir le restaurant
              </Link>
            </Button>
          )
        )}
      </div>
    </li>
  );
}

function ApproveDialog({ req, onClose, onDone }: { req: Req | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [currency, setCurrency] = useState<"XOF" | "EUR">("XOF");
  const [result, setResult] = useState<Approved | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  // Réinitialise le formulaire à chaque nouvelle demande ouverte.
  if (req && req.id !== lastId) {
    setLastId(req.id);
    setName(req.restaurant_name);
    setCity(req.city ?? "");
    setCurrency("XOF");
    setResult(null);
  }

  const approve = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/admin/restaurant-requests/{request_id}/approve", {
          params: { path: { request_id: req!.id } },
          body: {
            name: name.trim() || null,
            city: city.trim() || null,
            currency,
          },
        }),
      ),
    onSuccess: (r) => {
      toast.success(`Restaurant « ${name.trim() || req?.restaurant_name} » créé`);
      setResult(r);
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const close = () => {
    if (approve.isPending) return;
    setLastId(null);
    onClose();
  };

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? "Restaurant créé" : "Accepter la demande"}</DialogTitle>
          <DialogDescription>
            {result
              ? `Le restaurant est en ligne et ${result.owner_email} en est propriétaire.`
              : `Le restaurant sera créé avec son QR Code, et ${req?.email} en deviendra propriétaire.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          result.activation_url ? (
            <ActivationLink url={result.activation_url} email={result.owner_email} />
          ) : (
            <p className="rounded-lg bg-muted p-3 text-sm">
              Ce propriétaire avait déjà un compte : il retrouve le restaurant en se connectant.
            </p>
          )
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ap-name">Nom du restaurant</Label>
              <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ap-city">Ville</Label>
                <Input id="ap-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-currency">Devise</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "XOF" | "EUR")}>
                  <SelectTrigger id="ap-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="XOF">Franc CFA (XOF)</SelectItem>
                    <SelectItem value="EUR">Euro (EUR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/manage/${result.restaurant_id}`}>Ouvrir le restaurant</Link>
              </Button>
              <Button onClick={close}>Terminé</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={approve.isPending}>
                Annuler
              </Button>
              <Button onClick={() => approve.mutate()} disabled={approve.isPending || name.trim().length < 2}>
                {approve.isPending && <Loader2 className="animate-spin" />}
                Créer le restaurant
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ req, onClose, onDone }: { req: Req | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const reject = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/admin/restaurant-requests/{request_id}/reject", {
          params: { path: { request_id: req!.id } },
          body: { review_note: note.trim() },
        }),
      ),
    onSuccess: () => {
      toast.success("Demande refusée");
      setNote("");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && !reject.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refuser la demande</DialogTitle>
          <DialogDescription>
            {req?.restaurant_name} — indiquez le motif (visible dans l&apos;historique, à communiquer au demandeur).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rj-note">Motif du refus</Label>
          <Textarea id="rj-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={reject.isPending}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => reject.mutate()}
            disabled={reject.isPending || note.trim().length < 2}
          >
            {reject.isPending && <Loader2 className="animate-spin" />}
            Refuser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
