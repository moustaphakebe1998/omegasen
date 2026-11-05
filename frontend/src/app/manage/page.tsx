"use client";

import { ArrowRight, ChefHat, Plus, QrCode, Shield, Store, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { CreateRestaurantDialog } from "@/components/manage/layout/create-restaurant-dialog";
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

function spaceLabel(m: Membership): { label: string; icon: React.ComponentType<{ className?: string }> } {
  if (m.role === "KITCHEN") return { label: "Écran cuisine", icon: ChefHat };
  if (m.role === "CASHIER") return { label: "Caisse", icon: Wallet };
  return { label: "Gérer", icon: ArrowRight };
}

function Onboarding({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <QrCode className="size-7" />
        </span>
        <div className="max-w-md space-y-2">
          <h2 className="text-xl font-semibold">Créez votre premier restaurant</h2>
          <p className="text-sm text-muted-foreground">
            En quelques secondes, votre établissement est en ligne. Un <strong>QR Code permanent</strong> est
            généré automatiquement : imprimez-le une seule fois, posez-le sur vos tables, et vos clients
            consultent le menu et commandent depuis leur téléphone. Il reste valable même quand vous modifiez
            votre carte.
          </p>
        </div>
        <ol className="grid w-full max-w-lg gap-2 text-left text-sm sm:grid-cols-3">
          {["Créez le restaurant", "Ajoutez votre menu", "Imprimez le QR Code"].map((s, i) => (
            <li key={s} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <Button size="lg" onClick={onCreate}>
          <Plus />
          Créer un restaurant
        </Button>
      </CardContent>
    </Card>
  );
}

function ManageHome() {
  const { user } = useAuth();
  const params = useSearchParams();
  const isNew = params.get("new") === "1";
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const memberships = user.memberships;
  const showOnboarding = isNew || memberships.length === 0;

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
          {memberships.length > 0 && (
            <Button onClick={() => setOpen(true)}>
              <Plus />
              Créer un restaurant
            </Button>
          )}
        </div>

        {showOnboarding && <Onboarding onCreate={() => setOpen(true)} />}

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
      <CreateRestaurantDialog open={open} onOpenChange={setOpen} />
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
