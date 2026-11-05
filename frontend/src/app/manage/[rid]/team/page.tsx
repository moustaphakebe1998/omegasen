"use client";

import { ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";

import { useTeamAccess } from "@/components/manage/team/team-data";
import { TeamList } from "@/components/manage/team/team-list";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";

export default function TeamPage() {
  const { rid } = useParams<{ rid: string }>();
  const access = useTeamAccess(rid);

  if (!access.canView) {
    return (
      <>
        <PageHeader title="Équipe" />
        <EmptyState
          icon={ShieldAlert}
          title="Accès réservé"
          description="Vous n'avez pas la permission de consulter l'équipe de ce restaurant."
        />
      </>
    );
  }
  return <TeamList rid={rid} access={access} />;
}
