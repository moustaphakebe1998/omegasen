"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  MonitorSmartphone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Store,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Logo } from "@/components/shared/app-shell";
import { RequireAuth } from "@/components/shared/guards";
import { NotificationsBell } from "@/components/shared/notifications-bell";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/shared/status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { homeFor, useAuth, type User } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ROLE } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Session = Schemas["SessionOut"];
type ReservationStatus = Schemas["ReservationStatus"];
type RestaurantStatus = Schemas["RestaurantStatus"];
type Membership = User["memberships"][number];

const RESERVATION_STATUS: Record<ReservationStatus, { label: string; className: string }> = {
  PENDING: { label: "En attente", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  CONFIRMED: { label: "Confirmée", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  DECLINED: { label: "Refusée", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  CANCELLED: { label: "Annulée", className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" },
  SEATED: { label: "Installée", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  NO_SHOW: { label: "Absent", className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" },
};

const RESTAURANT_STATUS: Record<RestaurantStatus, { label: string; className: string }> = {
  PENDING: { label: "En attente", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  ACTIVE: { label: "Actif", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  SUSPENDED: { label: "Suspendu", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  CLOSED: { label: "Fermé", className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" },
};

const TONES = {
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
  green: "bg-green-50 text-green-600 dark:bg-green-950/60 dark:text-green-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300",
} as const;

// ── Éléments communs ────────────────────────────────────

function Section({
  icon: Icon,
  tone,
  title,
  description,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES[tone])} aria-hidden>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function StatusPill({ label, className }: { label: string; className: string }) {
  return <Badge className={cn("border-transparent", className)}>{label}</Badge>;
}

function Empty({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
        <Icon className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

// ── Profil ──────────────────────────────────────────────

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Indiquez votre nom").max(120),
  phone: z.string().trim().max(32, "32 caractères maximum"),
});

function ProfileSection({ user }: { user: User }) {
  const { reload } = useAuth();
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: user.full_name, phone: user.phone ?? "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const saved = await unwrap(
        api.PATCH("/api/auth/me", { body: { full_name: v.full_name, phone: v.phone ? v.phone : null } }),
      );
      form.reset({ full_name: saved.full_name, phone: saved.phone ?? "" });
      await reload();
      toast.success("Profil enregistré");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Section icon={UserRound} tone="orange" title="Profil" description="Vos informations personnelles.">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nom complet</Label>
          <Input id="full_name" autoComplete="name" className="h-11" aria-invalid={!!errors.full_name} {...form.register("full_name")} />
          <FieldError message={errors.full_name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" type="tel" autoComplete="tel" className="h-11" aria-invalid={!!errors.phone} {...form.register("phone")} />
          <FieldError message={errors.phone?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user.email} readOnly disabled className="h-11" />
          <p className="text-xs text-muted-foreground">L&apos;adresse email sert d&apos;identifiant et ne peut pas être modifiée.</p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" className="h-11 w-full sm:w-auto" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </form>
    </Section>
  );
}

// ── Sécurité ────────────────────────────────────────────

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Mot de passe actuel requis"),
    new_password: z.string().min(10, "10 caractères minimum").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Les mots de passe ne correspondent pas" })
  .refine((v) => v.new_password !== v.current_password, {
    path: ["new_password"],
    message: "Le nouveau mot de passe doit être différent de l'actuel",
  });

function PasswordSection({ user }: { user: User }) {
  const { login } = useAuth();
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await unwrap(
        api.POST("/api/auth/change-password", {
          body: { current_password: v.current_password, new_password: v.new_password },
        }),
      );
      // Le serveur révoque toutes les sessions : on rouvre aussitôt celle de cet appareil.
      await login(user.email, v.new_password);
      form.reset();
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Mot de passe modifié. Vos autres appareils ont été déconnectés.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Section icon={KeyRound} tone="violet" title="Mot de passe" description="Changer de mot de passe déconnecte vos autres appareils.">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
          <Label htmlFor="current_password">Mot de passe actuel</Label>
          <Input
            id="current_password"
            type="password"
            autoComplete="current-password"
            className="h-11"
            aria-invalid={!!errors.current_password}
            {...form.register("current_password")}
          />
          <FieldError message={errors.current_password?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new_password">Nouveau mot de passe</Label>
          <Input
            id="new_password"
            type="password"
            autoComplete="new-password"
            className="h-11"
            aria-invalid={!!errors.new_password}
            {...form.register("new_password")}
          />
          {errors.new_password ? (
            <FieldError message={errors.new_password.message} />
          ) : (
            <p className="text-xs text-muted-foreground">10 caractères minimum.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmer</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="h-11"
            aria-invalid={!!errors.confirm}
            {...form.register("confirm")}
          />
          <FieldError message={errors.confirm?.message} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" className="h-11 w-full sm:w-auto" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Changer le mot de passe
          </Button>
        </div>
      </form>
    </Section>
  );
}

/** "Chrome · macOS" à partir du User-Agent (approximation suffisante pour l'affichage). */
function describeUserAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Appareil inconnu", mobile: false };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const mobile = /Mobile|iPhone|Android/.test(ua);
  const label = [browser, os].filter(Boolean).join(" · ");
  return { label: label || ua.slice(0, 60), mobile };
}

function SessionsSection() {
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => unwrap(api.GET("/api/auth/sessions")),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/auth/sessions/{family_id}", { params: { path: { family_id: id } } })),
    onSuccess: () => {
      toast.success("Appareil déconnecté");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const revokeOthers = useMutation({
    mutationFn: () => unwrap(api.POST("/api/auth/sessions/revoke-others")),
    onSuccess: () => {
      toast.success("Les autres appareils ont été déconnectés");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current).length;

  return (
    <Section
      icon={MonitorSmartphone}
      tone="blue"
      title="Sessions actives"
      description="Les appareils connectés à votre compte."
      action={
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto" disabled={others === 0 || revokeOthers.isPending}>
              {revokeOthers.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              Déconnecter les autres appareils
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Déconnecter les autres appareils ?</AlertDialogTitle>
              <AlertDialogDescription>
                {others} appareil{others > 1 ? "s seront déconnectés" : " sera déconnecté"}. Cet appareil reste connecté.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => revokeOthers.mutate()}>Déconnecter</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      }
    >
      {sessions.isPending ? (
        <ListSkeleton />
      ) : sessions.isError ? (
        <p role="alert" className="text-sm text-destructive">{errorMessage(sessions.error)}</p>
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Sessions actives">
          {list.map((s: Session) => {
            const ua = describeUserAgent(s.user_agent);
            const Icon = ua.mobile ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 p-4" data-current={s.current || undefined}>
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    s.current ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{ua.label}</span>
                    {s.current && (
                      <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                        Cet appareil
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.ip_address ? `${s.ip_address} · ` : ""}Actif le {formatDateTime(s.last_used_at)}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive sm:px-3"
                    aria-label={`Déconnecter ${ua.label}`}
                    disabled={revoke.isPending && revoke.variables === s.id}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    <LogOut className="sm:hidden" aria-hidden />
                    <span className="hidden sm:inline">Déconnecter</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ── Espace client ───────────────────────────────────────

function OrdersSection() {
  const orders = useQuery({ queryKey: ["me", "orders"], queryFn: () => unwrap(api.GET("/api/me/orders")) });
  return (
    <Section icon={Receipt} tone="orange" title="Mes commandes" description="Vos commandes passées avec ce compte.">
      {orders.isPending ? (
        <ListSkeleton />
      ) : orders.isError ? (
        <p role="alert" className="text-sm text-destructive">{errorMessage(orders.error)}</p>
      ) : orders.data.length === 0 ? (
        <Empty icon={Receipt} title="Aucune commande pour le moment">
          <p className="text-sm text-muted-foreground">Scannez le QR Code d&apos;un restaurant pour commander.</p>
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {orders.data.map((o) => (
            <li key={o.reference}>
              <Link
                href={`/track/${o.tracking_token}`}
                className="group flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 font-medium">
                    <span className="truncate">{o.restaurant_name}</span>
                    <span className="text-sm text-muted-foreground">n° {o.display_number}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(o.created_at)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    <PaymentStatusBadge status={o.payment_status} />
                  </div>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ReservationsSection() {
  const reservations = useQuery({
    queryKey: ["me", "reservations"],
    queryFn: () => unwrap(api.GET("/api/me/reservations")),
  });
  return (
    <Section icon={CalendarDays} tone="blue" title="Mes réservations" description="Vos réservations de table.">
      {reservations.isPending ? (
        <ListSkeleton />
      ) : reservations.isError ? (
        <p role="alert" className="text-sm text-destructive">{errorMessage(reservations.error)}</p>
      ) : reservations.data.length === 0 ? (
        <Empty icon={CalendarDays} title="Aucune réservation pour le moment" />
      ) : (
        <ul className="grid gap-3">
          {reservations.data.map((r) => {
            const s = RESERVATION_STATUS[r.status];
            return (
              <li key={r.tracking_token}>
                <Link
                  href={`/reservation/${r.tracking_token}`}
                  className="group flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.restaurant_name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{formatDateTime(r.starts_at)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden />
                        {r.party_size} pers.
                      </span>
                    </p>
                    <div className="mt-2">
                      <StatusPill {...s} />
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ── Espaces professionnels ──────────────────────────────

function spaceHref(m: Membership): string {
  if (m.role === "KITCHEN") return `/kitchen/${m.restaurant_id}`;
  if (m.role === "CASHIER") return `/pos/${m.restaurant_id}`;
  return `/manage/${m.restaurant_id}`;
}

function SpacesSection({ user }: { user: User }) {
  return (
    <Section icon={Store} tone="green" title="Mes espaces" description="Les restaurants auxquels vous avez accès.">
      {user.memberships.length === 0 && !user.is_superadmin ? (
        <Empty icon={Store} title="Aucun restaurant rattaché à ce compte" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {user.is_superadmin && (
            <li>
              <Link
                href="/admin"
                className="group flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES.violet)} aria-hidden>
                  <ShieldCheck className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Super Admin</span>
                  <span className="block text-xs text-muted-foreground">Administration de la plateforme</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          )}
          {user.memberships.map((m) => {
            const st = RESTAURANT_STATUS[m.restaurant_status];
            return (
              <li key={m.restaurant_id}>
                <Link
                  href={spaceHref(m)}
                  className="group flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES.orange)} aria-hidden>
                    <Store className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.restaurant_name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">{ROLE[m.role]}</span>
                      {m.restaurant_status !== "ACTIVE" && <StatusPill {...st} />}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ── Page ────────────────────────────────────────────────

const TAB_IDS = ["profil", "securite", "commandes", "reservations", "espaces"] as const;
type Tab = (typeof TAB_IDS)[number];

function AccountContent() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("profil");
  const isCustomer = user!.account_type === "CUSTOMER" && user!.memberships.length === 0 && !user!.is_superadmin;
  const isStaff = !isCustomer;

  // Onglet initial depuis l'ancre (#securite, #commandes…).
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TAB_IDS.includes(h)) setTab(h);
  }, []);

  const changeTab = (v: string) => {
    setTab(v as Tab);
    history.replaceState(null, "", `#${v}`);
  };

  if (!user) return null;
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "profil", label: "Profil", show: true },
    { id: "securite", label: "Sécurité", show: true },
    { id: "commandes", label: "Commandes", show: isCustomer },
    { id: "reservations", label: "Réservations", show: isCustomer },
    { id: "espaces", label: "Mes espaces", show: isStaff },
  ];
  const back = isStaff ? homeFor(user) : "/";

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationsBell />
            <Button variant="ghost" size="sm" onClick={() => logout()} className="gap-2">
              <LogOut className="size-4" />
              Se déconnecter
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 md:py-10">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4 text-muted-foreground">
          <Link href={back}>
            <ArrowLeft aria-hidden /> {isStaff ? "Retour à mon espace" : "Accueil"}
          </Link>
        </Button>

        <div className="mb-6 flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground" aria-hidden>
            {user.full_name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight md:text-3xl">Mon compte</h1>
            <p className="truncate text-sm text-muted-foreground">
              {user.full_name} · {user.email}
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={changeTab} className="gap-6">
          <div className="overflow-x-auto">
            <TabsList className="h-11 w-full rounded-xl sm:w-fit">
              {tabs
                .filter((t) => t.show)
                .map((t) => (
                  <TabsTrigger key={t.id} value={t.id} className="flex-1 rounded-lg px-2 text-[13px] sm:flex-none sm:px-4 sm:text-sm">
                    {t.label}
                  </TabsTrigger>
                ))}
            </TabsList>
          </div>

          <TabsContent value="profil" className="space-y-6">
            <ProfileSection user={user} />
          </TabsContent>
          <TabsContent value="securite" className="space-y-6">
            <PasswordSection user={user} />
            <SessionsSection />
          </TabsContent>
          {isCustomer && (
            <>
              <TabsContent value="commandes">
                <OrdersSection />
              </TabsContent>
              <TabsContent value="reservations">
                <ReservationsSection />
              </TabsContent>
            </>
          )}
          {isStaff && (
            <TabsContent value="espaces">
              <SpacesSection user={user} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountContent />
    </RequireAuth>
  );
}
