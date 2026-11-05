"use client";

import { useParams } from "next/navigation";

import { SettingsView } from "@/components/manage/settings/settings-view";

export default function SettingsPage() {
  const { rid } = useParams<{ rid: string }>();
  return <SettingsView rid={rid} />;
}
