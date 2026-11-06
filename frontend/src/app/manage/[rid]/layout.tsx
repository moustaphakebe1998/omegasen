"use client";

import { useParams } from "next/navigation";

import { RestaurantShell } from "@/components/manage/layout/restaurant-shell";
import { RequireRestaurantRole } from "@/components/shared/guards";

export default function ManageRestaurantLayout({ children }: { children: React.ReactNode }) {
  const { rid } = useParams<{ rid: string }>();
  return (
    // Tout membre du restaurant : chaque rubrique est ensuite filtrée selon ses permissions effectives
    // (RestaurantShell), comme le backend. Un caissier à qui le propriétaire accorde les statistiques y accède.
    <RequireRestaurantRole restaurantId={rid} roles={["OWNER", "MANAGER", "CASHIER", "KITCHEN"]}>
      <RestaurantShell rid={rid}>{children}</RestaurantShell>
    </RequireRestaurantRole>
  );
}
