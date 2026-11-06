"use client";

import { MailWarning, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { useMemo, useState } from "react";

import { SearchInput } from "@/components/admin/common";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE, type MemberRole } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { AddMemberDialog } from "./add-member-dialog";
import { MemberActionDialogs, type PendingAction, useMemberMutations } from "./member-actions";
import { InvitationCard, MemberCard } from "./member-card";
import {
  ALL_ROLES,
  type Member,
  memberStatus,
  type MemberStatus,
  type teamAccess,
  teamErrorMessage,
  useCatalog,
  useInvalidateMembers,
  useMembers,
  useStations,
} from "./team-data";

type Access = ReturnType<typeof teamAccess>;
type StatusFilter = "ALL" | MemberStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Tous" },
  { value: "ACTIVE", label: "Actifs" },
  { value: "DISABLED", label: "Désactivés" },
  { value: "PENDING", label: "Invitations en attente" },
  { value: "EXPIRED", label: "Invitations expirées" },
];

/** Normalise pour une recherche insensible aux accents et à la casse. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function TeamList({ rid, access }: { rid: string; access: Access }) {
  const members = useMembers(rid);
  const catalog = useCatalog(rid);
  const stations = useStations(rid);
  const mutations = useMemberMutations(rid, catalog.data);
  const invalidate = useInvalidateMembers(rid);

  const [q, setQ] = useState("");
  const [role, setRole] = useState<MemberRole | "ALL">("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [resent, setResent] = useState<Member | null>(null);

  const all = useMemo(() => members.data ?? [], [members.data]);
  const counts = useMemo(() => {
    const c: Record<MemberStatus, number> = { ACTIVE: 0, DISABLED: 0, PENDING: 0, EXPIRED: 0 };
    for (const m of all) c[memberStatus(m)]++;
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const needle = fold(q.trim());
    return all.filter(
      (m) =>
        (!needle || fold(`${m.full_name} ${m.email}`).includes(needle)) &&
        (role === "ALL" || m.role === role) &&
        (status === "ALL" || memberStatus(m) === status),
    );
  }, [all, q, role, status]);
  const collaborators = filtered.filter((m) => m.activated);
  const invitations = filtered.filter((m) => !m.activated);
  const showCollaborators = status === "ALL" || status === "ACTIVE" || status === "DISABLED";
  const showInvitations = status === "ALL" || status === "PENDING" || status === "EXPIRED";
  const hasFilter = !!q.trim() || role !== "ALL" || status !== "ALL";

  const selfId = access.user?.id;
  const manageable = (m: Member) => access.canManage && access.canManageRole(m.role);
  const href = (m: Member) => `/manage/${rid}/team/${m.id}`;

  const resend = async (m: Member) => {
    try {
      setResent(await mutations.resend.mutateAsync(m));
    } catch {
      /* toast déjà affiché */
    }
  };

  return (
    <>
      <PageHeader
        title="Équipe"
        description="Invitez vos collaborateurs, attribuez-leur un rôle et ajustez précisément leurs permissions."
        actions={
          access.canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus aria-hidden />
              Ajouter un collaborateur
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat
          label="Collaborateurs actifs"
          value={counts.ACTIVE}
          icon={UserCheck}
          tone="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
          loading={members.isPending}
        />
        <Stat
          label="Invitations en attente"
          value={counts.PENDING}
          icon={MailWarning}
          tone="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          loading={members.isPending}
        />
        <Stat
          label="Désactivés"
          value={counts.DISABLED}
          icon={UserX}
          tone="bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          loading={members.isPending}
        />
      </div>

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Nom ou email…" label="Rechercher un collaborateur" />
          <Select value={role} onValueChange={(v) => setRole(v as MemberRole | "ALL")}>
            <SelectTrigger className="w-full sm:w-60" aria-label="Filtrer par rôle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les rôles</SelectItem>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
          {STATUS_FILTERS.map((f) => {
            const n = f.value === "ALL" ? all.length : counts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={status === f.value}
                onClick={() => setStatus(f.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  status === f.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-xs",
                    status === f.value ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {members.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement de l'équipe">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : members.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
          <p className="text-sm text-muted-foreground">{teamErrorMessage(members.error)}</p>
          <Button variant="outline" onClick={() => members.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {showCollaborators && (
            <Section title="Collaborateurs" count={collaborators.length} id="team-collaborators">
              {collaborators.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={hasFilter ? "Aucun collaborateur ne correspond" : "Aucun collaborateur"}
                  description={hasFilter ? "Modifiez la recherche ou les filtres." : undefined}
                />
              ) : (
                <ul className="space-y-3" aria-labelledby="team-collaborators">
                  {collaborators.map((m) => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      href={href(m)}
                      self={m.user_id === selfId}
                      manageable={manageable(m)}
                      onToggleActive={() => setPending({ kind: m.is_active ? "deactivate" : "reactivate", member: m })}
                      onRemove={() => setPending({ kind: "remove", member: m })}
                    />
                  ))}
                </ul>
              )}
            </Section>
          )}
          {showInvitations && (
            <Section title="Invitations" count={invitations.length} id="team-invitations">
              {invitations.length === 0 ? (
                <EmptyState
                  icon={MailWarning}
                  title={hasFilter ? "Aucune invitation ne correspond" : "Aucune invitation en cours"}
                  description={
                    hasFilter
                      ? "Modifiez la recherche ou les filtres."
                      : "Les personnes invitées apparaissent ici tant qu'elles n'ont pas activé leur compte."
                  }
                />
              ) : (
                <ul className="space-y-3" aria-labelledby="team-invitations">
                  {invitations.map((m) => (
                    <InvitationCard
                      key={m.id}
                      member={m}
                      href={href(m)}
                      self={m.user_id === selfId}
                      manageable={manageable(m)}
                      resending={mutations.resend.isPending && mutations.resend.variables?.id === m.id}
                      onResend={() => resend(m)}
                      onCancel={() => setPending({ kind: "remove", member: m })}
                    />
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>
      )}

      {!access.canManage && (
        <p className="mt-6 text-xs text-muted-foreground">
          Vous consultez l&apos;équipe en lecture seule : la permission « Gérer l&apos;équipe et les permissions » est
          nécessaire pour la modifier.
        </p>
      )}

      {access.canManage && (
        <AddMemberDialog
          rid={rid}
          open={addOpen}
          onOpenChange={setAddOpen}
          grantableRoles={access.grantableRoles}
          canGrant={access.canGrant}
          catalog={catalog.data}
          stations={stations.data ?? []}
          onAdded={() => void invalidate()}
        />
      )}
      <MemberActionDialogs
        pending={pending}
        setPending={setPending}
        resent={resent}
        setResent={setResent}
        mutations={mutations}
      />
    </>
  );
}

function Section({
  title,
  count,
  id,
  children,
}: {
  title: string;
  count: number;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 flex items-center gap-2 text-lg font-semibold">
        {title}
        <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  loading?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-3 shadow-xs sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10", tone)}>
        <Icon className="size-4 sm:size-5" />
      </span>
      <div className="min-w-0">
        <p className="tabular text-xl font-bold sm:text-2xl">{loading ? "–" : value}</p>
        <p className="text-xs leading-tight text-muted-foreground sm:text-sm">{label}</p>
      </div>
    </div>
  );
}
