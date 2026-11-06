"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Receipt } from "@/components/print/receipt";
import { ALL_ROLES } from "@/components/manage/team/team-data";
import { FullPageSpinner, RequireRestaurantRole } from "@/components/shared/guards";

function PrintContent() {
  const { rid, oid } = useParams<{ rid: string; oid: string }>();
  const autoPrint = useSearchParams().get("auto") === "1";
  return (
    <RequireRestaurantRole restaurantId={rid} roles={ALL_ROLES}>
      <Receipt rid={rid} oid={oid} autoPrint={autoPrint} />
    </RequireRestaurantRole>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <PrintContent />
    </Suspense>
  );
}
