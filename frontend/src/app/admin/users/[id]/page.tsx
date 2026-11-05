"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  Save,
  ShieldCheck,
  ShieldOff,
  Store,
  Trash2,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ActivationResult } from "@/components/admin/activation-link";
import { useAdminRestaurants } from "@/components/admin/create-user-dialog";
import {
  adminErrorMessage,
  ConfirmDialog,
  InitialsAvatar,
  type MemberRole,
  ROLES,
  roleLabel,
  UserStatusBadge,
} from "@/components/admin/status";
import { EmptyState } from "@/components/shared/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Schemas, unwrap } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type AdminUser = Schemas["AdminUser"];
type Membership = Schemas["AdminMembership"];
type Confirm = "deactivate" | "activate" | "grant" | "revoke" | { remove: Membership } | null;

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const key = ["admin", "users", "detail", id];
  const [activation, setActivation] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const user = useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/api/admin/users/{user_id}", { params: { path: { user_id: id } } })),
    retry: false,
  });

  const apply = (u: AdminUser) => {
    qc.setQueryData(key, u);
    void qc.invalidateQueries({ queryKey: ["admin"], predicate: (q) => q.queryKey[2] !== "detail" });
  };

  const patch = useMutation({
    mutationFn: (body: Schemas["AdminUserUpdate"]) =>
      unwrap(api.PATCH("/api/admin/users/{user_id}", { params: { path: { user_id: id } }, body })),
    onSuccess: (u, body) => {
      apply(u);
      setConfirm(null);
      if (body.is_active === false) toast.success("Compte désactivé : ses sessions ont été fermées");
      else if (body.is_active === true) toast.success("Compte réactivé");
      else if (body.is_superadmin !== undefined)
        toast.success(u.is_superadmin ? "Droits super admin accordés" : "Droits super admin retirés");
      else toast.success("Informations enregistrées");
    },
    onError: (e) => toast.error(adminErrorMessage(e)),
  });

  const resend = useMutation({
    mutationFn: () =>
      unwrap(api.POST("/api/admin/users/{user_id}/resend-activation", { params: { path: { user_id: id } } })),
    onSuccess: (u) => {
      apply(u);
      setActivation(u);
      toast.success(u.email_sent ? "Email d'activation renvoyé" : "Nouveau lien d'activation généré");
    },
    onError: (e) => toast.error(adminErrorMessage(e)),
  });

  const removeMembership = useMutation({
    mutationFn: (m: Membership) =>
      unwrap(
        api.DELETE("/api/admin/users/{user_id}/memberships/{membership_id}", {
          params: { path: { user_id: id, membership_id: m.id } },
        }),
      ),
    onSuccess: (u, m) => {
      apply(u);
      setConfirm(null);
      toast.success(`Retiré de ${m.restaurant_name}`);
    },
    onError: (e) => toast.error(adminErrorMessage(e)),
  });

  if (user.isPending)
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de l'utilisateur">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  if (user.isError)
    return (
      <EmptyState
        icon={UserCheck}
        title="Utilisateur introuvable"
        description={adminErrorMessage(user.error)}
        action={
          <Button asChild variant="outline">
            <Link href="/admin/users">Retour aux utilisateurs</Link>
          </Button>
        }
      />
    );

  const u = user.data;
  const self = u.id === me?.id;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/users">
          <ArrowLeft aria-hidden />
          Utilisateurs
        </Link>
      </Button>

      {/* En-tête */}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5 shadow-xs">
        <InitialsAvatar name={u.full_name} className="size-14 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{u.full_name}</h1>
          <p className="truncate text-sm text-muted-foreground">{u.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <UserStatusBadge status={u.status} />
            {u.is_superadmin && (
              <Badge className="border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                <ShieldCheck aria-hidden />
                Super admin
              </Badge>
            )}
            <Badge variant="outline">{u.account_type === "CUSTOMER" ? "Client" : "Personnel"}</Badge>
            {self && <Badge variant="secondary">Vous</Badge>}
          </div>
        </div>
        <dl className="grid basis-full grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:block sm:basis-auto sm:text-right">
          <div>
            <dt className="inline">Inscription : </dt>
            <dd className="inline">{formatDateTime(u.created_at)}</dd>
          </div>
          <div>
            <dt className="inline">Dernière connexion : </dt>
            <dd className="inline">{u.last_login_at ? formatDateTime(u.last_login_at) : "jamais"}</dd>
          </div>
        </dl>
      </section>

      {u.status === "PENDING" && (
        <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50/60 p-5 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <Mail className="size-4" aria-hidden />
              </span>
              <div className="text-sm">
                <p className="font-semibold">Compte en attente d&apos;activation</p>
                <p className="text-muted-foreground">
                  La personne n&apos;a pas encore choisi son mot de passe. Un nouveau lien invalide le précédent.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending} className="shrink-0">
              {resend.isPending ? <Loader2 className="animate-spin" /> : <Mail aria-hidden />}
              Renvoyer le lien d&apos;activation
            </Button>
          </div>
          {activation && (
            <ActivationResult
              url={activation.activation_url}
              email={activation.email}
              emailSent={activation.email_sent}
            />
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ProfileCard key={`${u.full_name}|${u.phone}`} user={u} pending={patch.isPending} onSave={patch.mutate} />

        {/* Accès */}
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
          <h2 className="font-semibold">Accès</h2>
          <AccessRow
            icon={u.is_active ? UserCheck : Ban}
            tone={
              u.is_active
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            }
            title={u.is_active ? "Compte actif" : "Compte désactivé"}
            text={
              u.is_active
                ? "La personne peut se connecter. La désactivation ferme immédiatement ses sessions."
                : "La personne ne peut plus se connecter."
            }
            action={
              <Button
                variant={u.is_active ? "destructive" : "default"}
                size="sm"
                disabled={self || patch.isPending}
                onClick={() => setConfirm(u.is_active ? "deactivate" : "activate")}
              >
                {u.is_active ? "Désactiver" : "Réactiver"}
              </Button>
            }
          />
          <AccessRow
            icon={u.is_superadmin ? ShieldCheck : ShieldOff}
            tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
            title={u.is_superadmin ? "Super admin" : "Pas de droits super admin"}
            text="Accès complet à la plateforme : restaurants, comptes, chiffre d'affaires."
            action={
              <Button
                variant="outline"
                size="sm"
                disabled={self || patch.isPending}
                onClick={() => setConfirm(u.is_superadmin ? "revoke" : "grant")}
              >
                {u.is_superadmin ? "Retirer" : "Accorder"}
              </Button>
            }
          />
          {self && (
            <p className="text-xs text-muted-foreground">
              Par sécurité, vous ne pouvez ni désactiver votre propre compte ni retirer vos propres droits.
            </p>
          )}
        </section>
      </div>

      <MembershipsCard user={u} onChange={apply} onRemove={(m) => setConfirm({ remove: m })} />

      <ConfirmDialog
        open={confirm === "deactivate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Désactiver ${u.full_name} ?`}
        description="La personne ne pourra plus se connecter et toutes ses sessions ouvertes sont fermées immédiatement. Vous pourrez la réactiver plus tard."
        confirmLabel="Désactiver"
        destructive
        pending={patch.isPending}
        onConfirm={() => patch.mutate({ is_active: false })}
      />
      <ConfirmDialog
        open={confirm === "activate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Réactiver ${u.full_name} ?`}
        description="La personne pourra de nouveau se connecter."
        confirmLabel="Réactiver"
        pending={patch.isPending}
        onConfirm={() => patch.mutate({ is_active: true })}
      />
      <ConfirmDialog
        open={confirm === "grant"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Faire de ${u.full_name} un super admin ?`}
        description="Ce compte aura un accès complet à toute la plateforme OmegaSen : restaurants, comptes, chiffre d'affaires et réglages. À réserver à l'équipe OmegaSen."
        confirmLabel="Accorder les droits"
        destructive
        pending={patch.isPending}
        onConfirm={() => patch.mutate({ is_superadmin: true })}
      />
      <ConfirmDialog
        open={confirm === "revoke"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Retirer les droits super admin de ${u.full_name} ?`}
        description="Ce compte n'aura plus accès à l'administration de la plateforme."
        confirmLabel="Retirer les droits"
        destructive
        pending={patch.isPending}
        onConfirm={() => patch.mutate({ is_superadmin: false })}
      />
      <ConfirmDialog
        open={typeof confirm === "object" && confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={typeof confirm === "object" && confirm ? `Retirer de ${confirm.remove.restaurant_name} ?` : "Retirer ?"}
        description="La personne perd immédiatement l'accès à ce restaurant."
        confirmLabel="Retirer"
        destructive
        pending={removeMembership.isPending}
        onConfirm={() => typeof confirm === "object" && confirm && removeMembership.mutate(confirm.remove)}
      />
    </div>
  );
}

function AccessRow({
  icon: Icon,
  tone,
  title,
  text,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  text: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function ProfileCard({
  user,
  pending,
  onSave,
}: {
  user: AdminUser;
  pending: boolean;
  onSave: (b: Schemas["AdminUserUpdate"]) => void;
}) {
  const [name, setName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const dirty = name.trim() !== user.full_name || phone.trim() !== (user.phone ?? "");
  const invalid = name.trim().length < 2;
  return (
    <form
      className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!dirty || invalid) return;
        onSave({ full_name: name.trim(), phone: phone.trim() || null });
      }}
    >
      <h2 className="font-semibold">Informations</h2>
      <div className="space-y-1.5">
        <Label htmlFor="u-name">Nom complet</Label>
        <Input
          id="u-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          aria-invalid={invalid}
        />
        {invalid && <p className="text-sm text-destructive">Nom trop court</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-phone">Téléphone</Label>
        <Input id="u-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="u-email">Email</Label>
        <Input id="u-email" value={user.email} readOnly disabled />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty || invalid || pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save aria-hidden />}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

function MembershipsCard({
  user,
  onChange,
  onRemove,
}: {
  user: AdminUser;
  onChange: (u: AdminUser) => void;
  onRemove: (m: Membership) => void;
}) {
  const restaurants = useAdminRestaurants();
  const [addRestaurant, setAddRestaurant] = useState("");
  const [addRole, setAddRole] = useState<MemberRole | "">("");

  const update = useMutation({
    mutationFn: ({ m, body }: { m: Membership; body: Schemas["MembershipPatch"] }) =>
      unwrap(
        api.PATCH("/api/admin/users/{user_id}/memberships/{membership_id}", {
          params: { path: { user_id: user.id, membership_id: m.id } },
          body,
        }),
      ),
    onSuccess: (u, { m, body }) => {
      onChange(u);
      if (body.role) toast.success(`Rôle mis à jour : ${roleLabel(body.role)} chez ${m.restaurant_name}`);
      else
        toast.success(
          body.is_active ? `Accès rétabli chez ${m.restaurant_name}` : `Accès suspendu chez ${m.restaurant_name}`,
        );
    },
    onError: (e) => toast.error(adminErrorMessage(e)),
  });

  const add = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/admin/users/{user_id}/memberships", {
          params: { path: { user_id: user.id } },
          body: { restaurant_id: addRestaurant, role: addRole as MemberRole },
        }),
      ),
    onSuccess: (u) => {
      onChange(u);
      setAddRestaurant("");
      setAddRole("");
      toast.success("Rattachement ajouté");
    },
    onError: (e) => toast.error(adminErrorMessage(e)),
  });

  const taken = new Set(user.memberships.map((m) => m.restaurant_id));
  const available = restaurants.data?.items.filter((r) => !taken.has(r.id)) ?? [];
  const busyId = update.isPending ? update.variables?.m.id : undefined;

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300">
          <Store className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold">Restaurants et rôles</h2>
          <p className="text-xs text-muted-foreground">Accès de la personne aux espaces des restaurants.</p>
        </div>
      </div>

      {user.memberships.length === 0 ? (
        <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">Rattaché(e) à aucun restaurant.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {user.memberships.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/restaurants/${m.restaurant_id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {m.restaurant_name}
                </Link>
                {!m.is_active && (
                  <Badge variant="outline" className="mt-1 text-muted-foreground">
                    Accès suspendu
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={m.role}
                  disabled={busyId === m.id}
                  onValueChange={(v) => update.mutate({ m, body: { role: v as MemberRole } })}
                >
                  <SelectTrigger className="w-full min-[420px]:w-56" aria-label={`Rôle chez ${m.restaurant_name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === m.id}
                  onClick={() => update.mutate({ m, body: { is_active: !m.is_active } })}
                >
                  {busyId === m.id ? (
                    <Loader2 className="animate-spin" />
                  ) : m.is_active ? (
                    <Pause aria-hidden />
                  ) : (
                    <Play aria-hidden />
                  )}
                  {m.is_active ? "Suspendre" : "Rétablir"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Retirer de ${m.restaurant_name}`}
                  onClick={() => onRemove(m)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (addRestaurant && addRole) add.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="add-restaurant">Ajouter à un restaurant</Label>
          <Select value={addRestaurant} onValueChange={setAddRestaurant}>
            <SelectTrigger id="add-restaurant" className="w-full bg-background">
              <SelectValue placeholder={available.length ? "Choisir un restaurant" : "Aucun restaurant disponible"} />
            </SelectTrigger>
            <SelectContent>
              {available.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-role">Rôle</Label>
          <Select value={addRole} onValueChange={(v) => setAddRole(v as MemberRole)}>
            <SelectTrigger id="add-role" className="w-full bg-background">
              <SelectValue placeholder="Choisir un rôle" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={!addRestaurant || !addRole || add.isPending}>
          {add.isPending ? <Loader2 className="animate-spin" /> : <Plus aria-hidden />}
          Ajouter
        </Button>
      </form>
    </section>
  );
}
