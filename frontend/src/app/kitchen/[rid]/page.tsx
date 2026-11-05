"use client";

import { useParams } from "next/navigation";

import { KitchenDisplay } from "@/components/kitchen/kitchen-display";
import { RequireRestaurantRole } from "@/components/shared/guards";

export default function KitchenPage() {
  const { rid } = useParams<{ rid: string }>();
  return (
    <RequireRestaurantRole restaurantId={rid} roles={["OWNER", "MANAGER", "KITCHEN", "CASHIER"]}>
      <KitchenDisplay rid={rid} />
    </RequireRestaurantRole>
  );
}
