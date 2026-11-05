"use client";

import { useParams } from "next/navigation";

import { QrManager } from "@/components/manage/qr/qr-manager";

export default function QrPage() {
  const { rid } = useParams<{ rid: string }>();
  return <QrManager rid={rid} />;
}
