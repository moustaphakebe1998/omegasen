"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, ScrollText } from "lucide-react";
import { Fragment, useState } from "react";

import { PAGE_SIZE, Pagination, SearchInput, useDebounced } from "@/components/admin/common";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PREFIXES = [
  { value: "", label: "Tout" },
  { value: "admin.", label: "Admin" },
  { value: "user.", label: "Comptes" },
  { value: "auth.", label: "Sécurité" },
  { value: "restaurant.", label: "Restaurants" },
  { value: "member.", label: "Équipes" },
  { value: "menu.", label: "Menu" },
  { value: "order.", label: "Commandes" },
  { value: "payment.", label: "Paiements" },
  { value: "qr.", label: "QR Code" },
];

export default function AdminAuditPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const prefix = useDebounced(action.trim());

  const list = useQuery({
    queryKey: ["admin", "audit", prefix, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/admin/audit-logs", {
          params: {
            query: { action: prefix || undefined, page, page_size: PAGE_SIZE },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  const changeAction = (v: string) => {
    setAction(v);
    setPage(1);
    setExpanded(null);
  };

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        description="Actions sensibles effectuées sur la plateforme, de la plus récente à la plus ancienne."
      />
      <div className="mb-3 flex items-center gap-3">
        <SearchInput
          value={action}
          onChange={changeAction}
          placeholder="Préfixe d'action (ex. order.)"
          label="Filtrer par action"
        />
        {list.isFetching && !list.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="toolbar" aria-label="Filtres rapides">
        {PREFIXES.map((p) => (
          <button
            key={p.value || "all"}
            type="button"
            aria-pressed={action === p.value}
            onClick={() => changeAction(p.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              action === p.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {list.isError ? (
        <p className="text-destructive">{errorMessage(list.error)}</p>
      ) : list.isLoading ? (
        <Skeleton className="h-64" />
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Aucune entrée" />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">Détails</span>
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Auteur</TableHead>
                <TableHead>Restaurant</TableHead>
                <TableHead>Entité</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.items.map((a) => {
                const open = expanded === a.id;
                const hasData = Object.keys(a.data ?? {}).length > 0;
                return (
                  <Fragment key={a.id}>
                    <TableRow>
                      <TableCell>
                        {hasData && (
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : a.id)}
                            aria-expanded={open}
                            aria-controls={`audit-${a.id}`}
                            aria-label={open ? "Masquer les détails" : "Afficher les détails"}
                            className="flex size-7 items-center justify-center rounded hover:bg-muted"
                          >
                            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDateTime(a.created_at)}</TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{a.action}</code>
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.actor_email ?? <span className="text-muted-foreground">Système</span>}
                      </TableCell>
                      <TableCell className="text-sm">{a.restaurant_name ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {a.entity ?? "—"}
                        {a.entity_id && (
                          <span
                            className="block max-w-40 truncate font-mono text-xs text-muted-foreground"
                            title={a.entity_id}
                          >
                            {a.entity_id}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{a.ip_address ?? "—"}</TableCell>
                    </TableRow>
                    {open && (
                      <TableRow id={`audit-${a.id}`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell />
                        <TableCell colSpan={6}>
                          <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
                            {JSON.stringify(a.data, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
    </>
  );
}
