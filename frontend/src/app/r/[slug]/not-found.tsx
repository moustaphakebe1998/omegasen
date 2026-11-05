import { Store } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";

export default function RestaurantNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4 text-center">
      <Logo className="text-xl" />
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Store className="size-8 text-muted-foreground" aria-hidden />
      </div>
      <div className="max-w-sm space-y-2">
        <h1 className="text-2xl font-bold">Restaurant introuvable</h1>
        <p className="text-muted-foreground">
          Ce restaurant n&apos;existe pas ou n&apos;est plus disponible. Vérifiez le lien ou recherchez-le depuis
          l&apos;accueil.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/#restaurants">Trouver un restaurant</Link>
      </Button>
    </main>
  );
}
