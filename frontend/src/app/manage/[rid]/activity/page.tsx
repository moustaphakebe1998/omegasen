"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, ScrollText } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { ROLE, type MemberRole } from "@/lib/labels";

const PAGE_SIZE = 30;

/** Libellés des actions du journal (les actions inconnues gardent leur code technique). */
const ACTION_LABEL: Record<string, string> = {
  "restaurant.created": "Restaurant créé",
  "restaurant.updated": "Informations modifiées",
  "admin.restaurant_status": "Statut du restaurant modifié",
  "admin.restaurant_created": "Restaurant créé par la plateforme",
  "member.added": "Collaborateur ajouté",
  "member.updated": "Collaborateur modifié",
  "member.removed": "Collaborateur retiré",
  "member.invite_resent": "Invitation renvoyée",
  "admin.membership_added": "Rattachement ajouté par la plateforme",
  "admin.membership_updated": "Rôle ou permissions modifiés par la plateforme",
  "admin.membership_removed": "Rattachement retiré par la plateforme",
  "auth.sessions_revoked": "Sessions fermées",
  "order.created": "Commande créée",
  "order.status_changed": "Statut de commande modifié",
  "payment.recorded": "Paiement encaissé",
  "payment.refunded": "Paiement remboursé",
  "menu.product_updated": "Plat modifié",
  "menu.product_availability": "Disponibilité d'un plat",
  "qr.updated": "QR Code personnalisé",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "actif",
  PENDING: "en attente",
  SUSPENDED: "suspendu",
  CLOSED: "fermé",
};

function summary(action: string, data: Record<string, unknown>): string | null {
  if (action === "admin.restaurant_status") {
    const before = STATUS_LABEL[String(data.before)] ?? data.before;
    const after = STATUS_LABEL[String(data.after)] ?? data.after;
    return `${before} → ${after}${data.reason ? ` · motif : ${data.reason}` : ""}`;
  }
  if (action === "member.added" && data.role) return `Rôle : ${ROLE[data.role as MemberRole] ?? data.role}`;
  if (action === "member.removed" && data.email) return String(data.email);
  if (action === "member.updated" && data.changes && typeof data.changes === "object") {
    return Object.keys(data.changes as object)
      .map((k) => ({ role: "rôle", permissions: "permissions", is_active: "statut", station_id: "poste" })[k] ?? k)
      .join(", ");
  }
  return null;
}

/** Journal d'activité de CE restaurant (le journal global de la plateforme est réservé au super admin). */
export default function ActivityPage() {
  const { rid } = useParams<{ rid: string }>();
  const [page, setPage] = useState(1);
  const log = useQuery({
    queryKey: ["activity", rid, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/activity", {
          params: { path: { restaurant_id: rid }, query: { page, page_size: PAGE_SIZE } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  const pages = Math.max(1, Math.ceil((log.data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Activité"
        description="Actions de l'équipe et de la plateforme sur ce restaurant, de la plus récente à la plus ancienne."
      />
      {log.isError ? (
        <p className="text-destructive">{errorMessage(log.error)}</p>
      ) : log.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !log.data?.items.length ? (
        <EmptyState icon={ScrollText} title="Aucune activité" />
      ) : (
        <>
          <ol className="divide-y rounded-2xl border bg-card">
            {log.data.items.map((a) => {
              const detail = summary(a.action, a.data);
              return (
                <li key={a.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-4">
                  <time className="tabular shrink-0 text-xs text-muted-foreground sm:w-40" dateTime={a.created_at}>
                    {formatDateTime(a.created_at)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</p>
                    {detail && <p className="truncate text-sm text-muted-foreground">{detail}</p>}
                  </div>
                  <p className="shrink-0 text-sm text-muted-foreground">{a.actor_name ?? "Système / client"}</p>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex items-center justify-end gap-2">
            {log.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Précédent
            </Button>
            <span className="tabular text-sm text-muted-foreground">
              {page} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Suivant
            </Button>
          </div>
        </>
      )}
    </>
  );
}
