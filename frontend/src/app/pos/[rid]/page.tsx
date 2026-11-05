"use client";

import { useParams } from "next/navigation";

import { PosScreen } from "@/components/pos/pos-screen";
import { RequireRestaurantRole } from "@/components/shared/guards";

export default function PosPage() {
  const { rid } = useParams<{ rid: string }>();
  return (
    <RequireRestaurantRole restaurantId={rid} roles={["OWNER", "MANAGER", "CASHIER"]}>
      <PosScreen rid={rid} />
    </RequireRestaurantRole>
  );
}
