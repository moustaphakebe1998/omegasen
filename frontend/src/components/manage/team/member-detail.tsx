"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Clock,
  IdCard,
  KeyRound,
  Loader2,
  MailWarning,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ActivationResult } from "@/components/admin/activation-link";
import { ConfirmDialog, InitialsAvatar } from "@/components/admin/status";
import { EmptyState } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { ROLE, type MemberRole } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { type MemberMutations, MemberActionDialogs, type PendingAction, useMemberMutations } from "./member-actions";
import { PermissionGrid, PermissionLegend } from "./permission-grid";
import {
  type Catalog,
  type Member,
  type Perm,
  roleDefaults,
  sameSet,
  type Station,
  type teamAccess,
  teamErrorMessage,
  useCatalog,
  useMembers,
  useStations,
  useTeamAccess,
} from "./team-data";
import { LockNote, MemberBadges, RoleOptions } from "./team-ui";

type Access = ReturnType<typeof teamAccess>;
const NO_STATION = "none";
const SELF_NOTE =
  "Vous ne pouvez pas modifier votre propre rôle, vos permissions ou votre statut, ni vous retirer de l'équipe.";
const OWNER_NOTE = "Seul un administrateur du restaurant peut modifier un administrateur.";
const READ_ONLY_NOTE = "Lecture seule : la permission « Gérer l'équipe et les permissions » est nécessaire.";

export function MemberDetail({ rid, memberId }: { rid: string; memberId: string }) {
  const access = useTeamAccess(rid);
  const members = useMembers(rid, access.canView);
  const catalog = useCatalog(rid);
  const stations = useStations(rid);
  const mutations = useMemberMutations(rid, catalog.data);
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [resent, setResent] = useState<Member | null>(null);
  const back = `/manage/${rid}/team`;

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
      <Link href={back}>
        <ArrowLeft aria-hidden />
        Équipe
      </Link>
    </Button>
  );

  if (!access.canView) {
    return (
      <>
        {backLink}
        <EmptyState icon={ShieldAlert} title="Accès réservé" description="Vous n'avez pas accès à l'équipe." />
      </>
    );
  }
  if (members.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement du collaborateur">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (members.isError) {
    return (
      <>
        {backLink}
        <p className="text-destructive">{teamErrorMessage(members.error)}</p>
      </>
    );
  }
  const m = members.data.find((x) => x.id === memberId);
  if (!m) {
    return (
      <>
        {backLink}
        <EmptyState
          icon={UserCog}
          title="Collaborateur introuvable"
          description="Il a peut-être été retiré de l'équipe."
        />
      </>
    );
  }

  const self = m.user_id === access.user?.id;
  const ownerLocked = m.role === "OWNER" && !access.isOwner;
  const canEdit = access.canManage && !ownerLocked;
  const canEditAccess = canEdit && !self;
  const accessNote = !access.canManage ? READ_ONLY_NOTE : ownerLocked ? OWNER_NOTE : self ? SELF_NOTE : null;

  return (
    <>
      {backLink}
      <HeaderCard member={m} self={self} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ProfileCard key={`${m.id}-${m.full_name}-${m.phone}`} rid={rid} member={m} canEdit={canEdit} mutations={mutations} />
        <RoleCard
          rid={rid}
          member={m}
          access={access}
          canEditAccess={canEditAccess}
          canEditStation={canEdit}
          note={accessNote}
          stations={stations.data ?? []}
          mutations={mutations}
        />
      </div>

      {!m.activated && (
        <InvitationPanel
          member={m}
          manageable={canEdit}
          mutations={mutations}
          onResent={setResent}
          onCancel={() => setPending({ kind: "remove", member: m })}
        />
      )}

      {catalog.data && (
        <PermissionsCard
          key={`${m.id}-${m.role}-${m.permissions.join(",")}`}
          member={m}
          catalog={catalog.data}
          access={access}
          canEditAccess={canEditAccess}
          note={accessNote}
          mutations={mutations}
        />
      )}

      <StatusCard
        member={m}
        canEditAccess={canEditAccess}
        note={accessNote}
        onToggle={() => setPending({ kind: m.is_active ? "deactivate" : "reactivate", member: m })}
        onRemove={() => setPending({ kind: "remove", member: m })}
      />

      <MemberActionDialogs
        pending={pending}
        setPending={setPending}
        resent={resent}
        setResent={setResent}
        mutations={mutations}
        onRemoved={() => router.push(back)}
      />
    </>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  tone,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border bg-card p-4 shadow-xs sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function HeaderCard({ member: m, self }: { member: Member; self: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:p-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <InitialsAvatar name={m.full_name} className="size-14 rounded-2xl text-lg" />
        <div className="min-w-0 space-y-1.5">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="min-w-0 break-words">{m.full_name}</span>
            {self && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">Vous</span>}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{m.email}</p>
          <MemberBadges member={m} />
        </div>
      </div>
      <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:block sm:space-y-1 sm:text-right">
        <div>
          <dt className="inline">Membre depuis le </dt>
          <dd className="inline font-medium text-foreground">{formatDateTime(m.created_at)}</dd>
        </div>
        <div>
          <dt className="inline">{m.last_login_at ? "Dernière connexion le " : "Connexion : "}</dt>
          <dd className="inline font-medium text-foreground">
            {m.last_login_at ? formatDateTime(m.last_login_at) : "jamais"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Nom requis (2 caractères minimum)").max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((v) => !v || /^[0-9+ ().-]{6,32}$/.test(v), "Numéro de téléphone invalide"),
});

function ProfileCard({
  member: m,
  canEdit,
  mutations,
}: {
  rid: string;
  member: Member;
  canEdit: boolean;
  mutations: MemberMutations;
}) {
  const editable = canEdit && m.editable_profile;
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: m.full_name, phone: m.phone ?? "" },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    try {
      await mutations.update.mutateAsync({
        member: m,
        body: { full_name: v.full_name.trim(), phone: v.phone.trim() || null },
        success: "Profil mis à jour",
      });
    } catch {
      /* toast déjà affiché */
    }
  });

  return (
    <Panel
      title="Profil"
      description="Nom et téléphone du collaborateur."
      icon={IdCard}
      tone="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
    >
      {editable ? (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="md-name">Nom complet</Label>
            <Input id="md-name" aria-invalid={!!errors.full_name} {...form.register("full_name")} />
            {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="md-phone">
              Téléphone <span className="font-normal text-muted-foreground">(facultatif)</span>
            </Label>
            <Input id="md-phone" type="tel" inputMode="tel" aria-invalid={!!errors.phone} {...form.register("phone")} />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!form.formState.isDirty || form.formState.isSubmitting}
              onClick={() => form.reset()}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Nom complet</dt>
              <dd className="font-medium break-words">{m.full_name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Téléphone</dt>
              <dd className="font-medium">{m.phone || "Non renseigné"}</dd>
            </div>
          </dl>
          {canEdit && !m.editable_profile && (
            <LockNote>
              Ce compte est aussi utilisé dans un autre établissement : seul son titulaire peut modifier son nom et son
              téléphone, depuis son propre espace.
            </LockNote>
          )}
        </div>
      )}
    </Panel>
  );
}

function RoleCard({
  member: m,
  access,
  canEditAccess,
  canEditStation,
  note,
  stations,
  mutations,
}: {
  rid: string;
  member: Member;
  access: Access;
  canEditAccess: boolean;
  canEditStation: boolean;
  note: string | null;
  stations: Station[];
  mutations: MemberMutations;
}) {
  const [nextRole, setNextRole] = useState<MemberRole | null>(null);
  const roles = access.grantableRoles.includes(m.role) ? access.grantableRoles : [m.role, ...access.grantableRoles];
  const busy = mutations.update.isPending;
  const stationKnown = !m.station_id || stations.some((s) => s.id === m.station_id);

  const confirmRole = async () => {
    if (!nextRole) return;
    try {
      await mutations.update.mutateAsync({
        member: m,
        body: { role: nextRole },
        success: `${m.full_name} est maintenant « ${ROLE[nextRole]} »`,
      });
      setNextRole(null);
    } catch {
      /* toast déjà affiché */
    }
  };

  return (
    <Panel
      title="Rôle et poste"
      description="Le rôle définit les permissions de départ ; le poste, l'écran cuisine affiché."
      icon={UserCog}
      tone="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="md-role">Rôle</Label>
          <Select
            value={m.role}
            disabled={!canEditAccess || busy}
            onValueChange={(v) => v !== m.role && setNextRole(v as MemberRole)}
          >
            <SelectTrigger id="md-role" className="w-full" aria-describedby={note ? "md-role-note" : undefined}>
              <SelectValue>{ROLE[m.role]}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-w-[min(26rem,calc(100vw-2rem))]">
              <RoleOptions roles={roles} />
            </SelectContent>
          </Select>
          {note && (
            <p id="md-role-note" className="text-xs text-muted-foreground">
              {note}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="md-station">Poste</Label>
          <Select
            value={m.station_id ?? NO_STATION}
            disabled={!canEditStation || busy}
            onValueChange={(v) =>
              mutations.update
                .mutateAsync({
                  member: m,
                  body: { station_id: v === NO_STATION ? null : v },
                  success: v === NO_STATION ? "Poste retiré" : "Poste mis à jour",
                })
                .catch(() => undefined)
            }
          >
            <SelectTrigger id="md-station" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_STATION}>Aucun poste</SelectItem>
              {!stationKnown && m.station_id && <SelectItem value={m.station_id}>{m.station_name ?? "Poste"}</SelectItem>}
              {stations.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Les postes (grill, boissons…) se gèrent dans les paramètres du restaurant.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={!!nextRole}
        onOpenChange={(o) => !o && setNextRole(null)}
        title={nextRole === "OWNER" ? `Nommer ${m.full_name} administrateur ?` : `Changer le rôle de ${m.full_name} ?`}
        description={nextRole ? roleChangeText(m, nextRole) : null}
        confirmLabel={nextRole === "OWNER" ? "Nommer administrateur" : "Changer le rôle"}
        destructive={nextRole === "OWNER" || m.role === "OWNER"}
        pending={busy}
        onConfirm={confirmRole}
      />
    </Panel>
  );
}

function roleChangeText(m: Member, to: MemberRole): React.ReactNode {
  return (
    <span className="block space-y-2">
      <span className="block">
        Nouveau rôle : <strong>{ROLE[to]}</strong> (actuellement {ROLE[m.role]}).
      </span>
      {to === "OWNER" ? (
        <span className="block">
          Un administrateur du restaurant a <strong>toutes les permissions</strong>, sans restriction possible : il
          pourra gérer l&apos;équipe, nommer ou retirer d&apos;autres administrateurs, y compris vous.
        </span>
      ) : m.role === "OWNER" ? (
        <span className="block">
          Cette personne perdra ses droits d&apos;administrateur et n&apos;aura plus que les permissions du rôle
          « {ROLE[to]} ».
        </span>
      ) : (
        <span className="block">
          Ses permissions seront remplacées par celles du rôle « {ROLE[to]} »
          {Object.keys(m.permission_overrides).length ? " : ses permissions personnalisées seront perdues" : ""}.
        </span>
      )}
    </span>
  );
}

function InvitationPanel({
  member: m,
  manageable,
  mutations,
  onResent,
  onCancel,
}: {
  member: Member;
  manageable: boolean;
  mutations: MemberMutations;
  onResent: (m: Member) => void;
  onCancel: () => void;
}) {
  const expired = m.invite_status === "EXPIRED";
  const resend = async () => {
    try {
      onResent(await mutations.resend.mutateAsync(m));
    } catch {
      /* toast déjà affiché */
    }
  };
  return (
    <Panel
      className="mt-6"
      title="Invitation"
      description={
        expired
          ? "Le lien d'activation a expiré : renvoyez une invitation pour que la personne puisse rejoindre l'équipe."
          : "La personne n'a pas encore choisi son mot de passe."
      }
      icon={MailWarning}
      tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("flex items-center gap-2 text-sm", expired && "text-destructive")}>
          <Clock className="size-4 shrink-0" aria-hidden />
          {m.invite_expires_at
            ? `${expired ? "Expirée le" : "Expire le"} ${formatDateTime(m.invite_expires_at)}`
            : "Aucun lien valide"}
        </p>
        {manageable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={resend} disabled={mutations.resend.isPending}>
              {mutations.resend.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Renvoyer l&apos;invitation
            </Button>
            <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onCancel}>
              <X />
              Annuler l&apos;invitation
            </Button>
          </div>
        )}
      </div>
      {m.activation_url && (
        <div className="mt-4">
          <ActivationResult url={m.activation_url} email={m.email} emailSent={m.email_sent} />
        </div>
      )}
    </Panel>
  );
}

function PermissionsCard({
  member: m,
  catalog,
  access,
  canEditAccess,
  note,
  mutations,
}: {
  member: Member;
  catalog: Catalog;
  access: Access;
  canEditAccess: boolean;
  note: string | null;
  mutations: MemberMutations;
}) {
  const saved = new Set<Perm>(m.permissions);
  const [draft, setDraft] = useState<Set<Perm>>(() => new Set(m.permissions));
  const defaults = roleDefaults(catalog, m.role);
  const isOwnerRole = m.role === "OWNER";
  const editable = canEditAccess && !isOwnerRole;
  const changes = [...new Set([...draft, ...saved])].filter((p) => draft.has(p) !== saved.has(p)).length;
  const dirty = changes > 0;
  const atDefaults = sameSet(draft, defaults);
  const busy = mutations.update.isPending;

  const save = async () => {
    try {
      await mutations.update.mutateAsync({
        member: m,
        body: atDefaults ? { reset_permissions: true } : { permissions: [...draft] },
        success: atDefaults ? "Permissions du rôle rétablies" : "Permissions enregistrées",
      });
    } catch {
      /* toast déjà affiché */
    }
  };

  return (
    <Panel
      className="mt-6"
      title="Permissions"
      description={
        isOwnerRole
          ? "Un administrateur du restaurant a toujours toutes les permissions."
          : `Préréglage du rôle « ${ROLE[m.role]} », ajustable permission par permission.`
      }
      icon={isOwnerRole ? ShieldCheck : SlidersHorizontal}
      tone="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      action={
        editable && (
          <Button variant="outline" size="sm" disabled={atDefaults || busy} onClick={() => setDraft(new Set(defaults))}>
            <RotateCcw aria-hidden />
            Revenir aux permissions du rôle
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {!isOwnerRole && <PermissionLegend />}
        {!editable && note && !isOwnerRole && <LockNote>{note}</LockNote>}
        {isOwnerRole && <LockNote>Les permissions d&apos;un administrateur ne sont pas modifiables.</LockNote>}
        <PermissionGrid
          catalog={catalog}
          value={draft}
          onChange={setDraft}
          defaults={defaults}
          saved={saved}
          disabled={!editable}
          canGrant={access.canGrant}
        />
        {editable && (
          <div
            className={cn(
              "sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border bg-background/95 p-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between",
              !dirty && "static border-dashed shadow-none",
            )}
          >
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {dirty
                ? `${changes} modification${changes > 1 ? "s" : ""} non enregistrée${changes > 1 ? "s" : ""}`
                : "Aucune modification"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!dirty || busy} onClick={() => setDraft(new Set(saved))}>
                Annuler
              </Button>
              <Button disabled={!dirty || busy} onClick={save}>
                {busy && <Loader2 className="animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function StatusCard({
  member: m,
  canEditAccess,
  note,
  onToggle,
  onRemove,
}: {
  member: Member;
  canEditAccess: boolean;
  note: string | null;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <Panel
      className="mt-6"
      title="Accès au restaurant"
      description="Suspendre temporairement ou retirer définitivement l'accès."
      icon={Power}
      tone="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
    >
      <div className="divide-y rounded-xl border">
        {m.must_change_password && (
          <div className="flex items-start gap-3 p-4 text-sm">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
            <p>
              <span className="font-medium">Mot de passe initial pas encore changé.</span>{" "}
              <span className="text-muted-foreground">
                Il devra le remplacer à sa première connexion avant d&apos;accéder au restaurant.
              </span>
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-medium">{m.is_active ? "Accès actif" : "Accès désactivé"}</p>
            <p className="text-muted-foreground">
              {m.is_active
                ? "Désactivez pour suspendre l'accès sans perdre le rôle ni les permissions."
                : "Réactivez pour lui rendre l'accès avec son rôle et ses permissions."}
            </p>
          </div>
          <Button variant="outline" className="shrink-0" disabled={!canEditAccess} onClick={onToggle}>
            <Power aria-hidden />
            {m.is_active ? "Désactiver" : "Réactiver"}
          </Button>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-medium">Retirer de l&apos;équipe</p>
            <p className="text-muted-foreground">
              Supprime son accès à ce restaurant. Son compte OmegaSen n&apos;est supprimé que s&apos;il n&apos;a jamais
              été activé et n&apos;appartient à aucun autre établissement.
            </p>
          </div>
          <Button variant="destructive" className="shrink-0" disabled={!canEditAccess} onClick={onRemove}>
            <Trash2 aria-hidden />
            Retirer de l&apos;équipe
          </Button>
        </div>
      </div>
      {!canEditAccess && note && <LockNote className="mt-4">{note}</LockNote>}
    </Panel>
  );
}
