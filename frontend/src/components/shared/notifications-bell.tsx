"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useUserSocket, type RealtimeEvent } from "@/lib/realtime";
import { cn } from "@/lib/utils";

type Notification = Schemas["NotificationOut"];
type Page = Schemas["NotificationPage"];

const LIMIT = 20;
const QUERY_KEY = ["notifications"] as const;

/** "à l'instant", "il y a 5 min", "il y a 3 h", "hier", "il y a 4 j", puis la date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Seuls les liens internes sont suivis. */
function safeLink(link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

/**
 * Cloche de notifications : badge des non lues (mis à jour en direct via /api/ws/me),
 * liste des dernières notifications, toast à chaque nouvelle notification.
 */
export function NotificationsBell({ className }: { className?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => unwrap(api.GET("/api/notifications", { params: { query: { limit: LIMIT } } })),
    enabled: !!user,
    staleTime: 60_000,
  });

  // Rafraîchit les durées relatives quand le menu est ouvert.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [open]);

  const go = useCallback(
    (link: string | null) => {
      const href = safeLink(link);
      if (href) router.push(href);
    },
    [router],
  );

  const onEvent = useCallback(
    (e: RealtimeEvent) => {
      if (e.event !== "notification.created" || !e.data) return;
      const n = e.data as Notification;
      qc.setQueryData<Page>(QUERY_KEY, (prev) => {
        if (!prev) return prev;
        if (prev.items.some((x) => x.id === n.id)) return prev;
        return {
          items: [n, ...prev.items].slice(0, LIMIT),
          unread: prev.unread + (n.read_at ? 0 : 1),
        };
      });
      const href = safeLink(n.link);
      toast(n.title, {
        description: n.body ?? undefined,
        action: href ? { label: "Voir", onClick: () => router.push(href) } : undefined,
      });
    },
    [qc, router],
  );

  // À chaque (re)connexion : recharge la liste pour récupérer ce qui a pu être manqué.
  const onReconnect = useCallback(() => {
    void qc.invalidateQueries({ queryKey: QUERY_KEY });
  }, [qc]);

  useUserSocket(user?.id ?? null, onEvent, onReconnect);

  const markRead = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/notifications/{notification_id}/read", { params: { path: { notification_id: id } } })),
    onMutate: (id) => {
      qc.setQueryData<Page>(QUERY_KEY, (prev) =>
        prev
          ? {
              items: prev.items.map((x) => (x.id === id && !x.read_at ? { ...x, read_at: new Date().toISOString() } : x)),
              unread: Math.max(0, prev.unread - (prev.items.find((x) => x.id === id && !x.read_at) ? 1 : 0)),
            }
          : prev,
      );
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const markAll = useMutation({
    mutationFn: () => unwrap(api.POST("/api/notifications/read-all")),
    onMutate: () => {
      const now = new Date().toISOString();
      qc.setQueryData<Page>(QUERY_KEY, (prev) =>
        prev ? { items: prev.items.map((x) => ({ ...x, read_at: x.read_at ?? now })), unread: 0 } : prev,
      );
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  if (!user) return null;
  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;
  const label = unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative", className)} aria-label={label}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span
              data-testid="notifications-unread"
              className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-none font-semibold text-primary-foreground ring-2 ring-background"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <DropdownMenuLabel className="p-0 text-base font-semibold">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs text-primary"
              onClick={(e) => {
                e.preventDefault();
                markAll.mutate();
              }}
            >
              <CheckCheck className="size-4" />
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {query.isPending ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <BellOff className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Aucune notification</p>
              <p className="mt-1 text-xs text-muted-foreground">Les nouvelles commandes et alertes apparaîtront ici.</p>
            </div>
          </div>
        ) : (
          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto p-1.5">
            {items.map((n) => {
              const isUnread = !n.read_at;
              return (
                <DropdownMenuItem
                  key={n.id}
                  onSelect={() => {
                    if (isUnread) markRead.mutate(n.id);
                    go(n.link);
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-xl px-3 py-2.5",
                    isUnread && "bg-primary/5 focus:bg-primary/10",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      isUnread ? "bg-primary" : "bg-transparent",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm leading-snug", isUnread ? "font-semibold" : "font-medium")}>
                      {n.title}
                      {isUnread && <span className="sr-only"> (non lue)</span>}
                    </span>
                    {n.body && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      <time dateTime={n.created_at}>{relativeTime(n.created_at)}</time>
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
