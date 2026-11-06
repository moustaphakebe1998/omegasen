"use client";

import { useParams } from "next/navigation";

import { RestaurantShell } from "@/components/manage/layout/restaurant-shell";
import { ALL_ROLES } from "@/components/manage/team/team-data";
import { RequireRestaurantRole } from "@/components/shared/guards";

export default function ManageRestaurantLayout({ children }: { children: React.ReactNode }) {
  const { rid } = useParams<{ rid: string }>();
  return (
    // Tout membre du restaurant : chaque rubrique est ensuite filtrée selon ses permissions effectives
    // (RestaurantShell), comme le backend. Un caissier à qui le propriétaire accorde les statistiques y accède.
    <RequireRestaurantRole restaurantId={rid} roles={ALL_ROLES}>
      <RestaurantShell rid={rid}>{children}</RestaurantShell>
    </RequireRestaurantRole>
  );
}
