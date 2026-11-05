"use client";

import { ArrowRight, ChefHat, Plus, QrCode, Send, Shield, Store, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/shared/app-shell";
import { RequireAuth } from "@/components/shared/guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type Schemas } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { ROLE } from "@/lib/labels";

type Membership = Schemas["MembershipOut"];

function hrefFor(m: Membership): string {
  if (m.role === "KITCHEN") return `/kitchen/${m.restaurant_id}`;
  if (m.role === "CASHIER") return `/pos/${m.restaurant_id}`;
  return `/manage/${m.restaurant_id}`;
}

function spaceLabel(m: Membership): {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  if (m.role === "KITCHEN") return { label: "Écran cuisine", icon: ChefHat };
  if (m.role === "CASHIER") return { label: "Caisse", icon: Wallet };
  return { label: "Gérer", icon: ArrowRight };
}

/** Compte sans restaurant : les restaurants sont ouverts par le super admin, sur demande. */
function NoRestaurant() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <QrCode className="size-7" aria-hidden />
      </span>
      <div className="max-w-md space-y-2">
        <h2 className="text-xl font-semibold">Aucun restaurant pour le moment</h2>
        <p className="text-sm text-muted-foreground">
          Les restaurants sont ouverts sur OmegaSen par notre équipe. Si vous êtes restaurateur, envoyez une demande
          d&apos;ouverture. Si vous êtes employé, demandez à votre responsable de vous ajouter à son équipe.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/demande">
          <Send aria-hidden />
          Demander l&apos;ouverture d&apos;un restaurant
        </Link>
      </Button>
    </div>
  );
}

function ManageHome() {
  const { user } = useAuth();
  if (!user) return null;
  const memberships = user.memberships;

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="flex h-14 items-center gap-2 border-b bg-background px-4">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          {user.is_superadmin && (
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">
                <Shield />
                Super Admin
              </Link>
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mes restaurants</h1>
            <p className="mt-1 text-sm text-muted-foreground">Bonjour {user.full_name}, choisissez un espace.</p>
          </div>
          {user.is_superadmin && (
            <Button asChild>
              <Link href="/admin/restaurants">
                <Plus />
                Créer un restaurant
              </Link>
            </Button>
          )}
        </div>

        {memberships.length === 0 && !user.is_superadmin && <NoRestaurant />}

        {memberships.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map((m) => {
              const space = spaceLabel(m);
              const Icon = space.icon;
              return (
                <li key={m.restaurant_id}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Store className="size-5" />
                        </span>
                        <Badge variant="secondary">{ROLE[m.role]}</Badge>
                      </div>
                      <CardTitle className="truncate pt-2">{m.restaurant_name}</CardTitle>
                      <CardDescription className="truncate">/r/{m.restaurant_slug}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button asChild className="w-full" variant="outline">
                        <Link href={hrefFor(m)}>
                          <Icon />
                          {space.label}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default function ManagePage() {
  return (
    <RequireAuth>
      <Suspense>
        <ManageHome />
      </Suspense>
    </RequireAuth>
  );
}
