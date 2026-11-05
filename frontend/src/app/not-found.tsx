import { Compass } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4 text-center">
      <Logo className="text-xl" />
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Compass className="size-8 text-primary" aria-hidden />
      </div>
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-semibold text-primary">Erreur 404</p>
        <h1 className="text-2xl font-bold">Page introuvable</h1>
        <p className="text-muted-foreground">
          La page que vous cherchez n&apos;existe pas ou a été déplacée.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </main>
  );
}
