"use client";

import { useParams } from "next/navigation";

import { KitchenDisplay } from "@/components/kitchen/kitchen-display";
import { RequireRestaurantPerm } from "@/components/shared/guards";

export default function KitchenPage() {
  const { rid } = useParams<{ rid: string }>();
  return (
    <RequireRestaurantPerm
      restaurantId={rid}
      perm="orders.prepare"
      message="Vous n'avez pas la permission d'utiliser l'écran cuisine."
    >
      <KitchenDisplay rid={rid} />
    </RequireRestaurantPerm>
  );
}
