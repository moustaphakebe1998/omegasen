"use client";

import { useParams } from "next/navigation";

import { RestaurantShell } from "@/components/manage/layout/restaurant-shell";
import { RequireRestaurantRole } from "@/components/shared/guards";

export default function ManageRestaurantLayout({ children }: { children: React.ReactNode }) {
  const { rid } = useParams<{ rid: string }>();
  return (
    <RequireRestaurantRole restaurantId={rid} roles={["OWNER", "MANAGER"]}>
      <RestaurantShell rid={rid}>{children}</RestaurantShell>
    </RequireRestaurantRole>
  );
}
