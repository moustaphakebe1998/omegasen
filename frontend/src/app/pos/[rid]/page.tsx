"use client";

import { useParams } from "next/navigation";

import { PosScreen } from "@/components/pos/pos-screen";
import { RequireRestaurantPerm } from "@/components/shared/guards";

export default function PosPage() {
  const { rid } = useParams<{ rid: string }>();
  return (
    <RequireRestaurantPerm
      restaurantId={rid}
      perm="orders.create"
      message="Vous n'avez pas la permission de prendre des commandes à la caisse."
    >
      <PosScreen rid={rid} />
    </RequireRestaurantPerm>
  );
}
