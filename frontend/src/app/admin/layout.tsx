"use client";

import { Inbox, LayoutDashboard, ScrollText, Store, Users } from "lucide-react";

import { AppShell, type NavItem } from "@/components/shared/app-shell";
import { RequireSuperAdmin } from "@/components/shared/guards";

const NAV: NavItem[] = [
  {
    href: "/admin",
    label: "Vue d'ensemble",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/admin/requests", label: "Demandes", icon: Inbox },
  { href: "/admin/restaurants", label: "Restaurants", icon: Store },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/audit", label: "Journal d'audit", icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSuperAdmin>
      <AppShell title="Super Admin" subtitle="Administration de la plateforme" nav={NAV}>
        {children}
      </AppShell>
    </RequireSuperAdmin>
  );
}
