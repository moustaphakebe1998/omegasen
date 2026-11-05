"use client";

import { useParams } from "next/navigation";

import { MenuEditor } from "@/components/manage/menu/menu-editor";

export default function MenuPage() {
  const { rid } = useParams<{ rid: string }>();
  return <MenuEditor rid={rid} />;
}
