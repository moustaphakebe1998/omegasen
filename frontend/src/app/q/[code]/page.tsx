"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, QrCode, Store } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { EmptyState, Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { ApiError, api, errorMessage, unwrap } from "@/lib/api/client";
import { tableParam } from "@/lib/tables";

/** Point d'entrée des QR Codes : /q/{code} → page du restaurant (canal QR). */
export default function QrEntryPage() {
  return (
    <Suspense>
      <QrEntry />
    </Suspense>
  );
}

function QrEntry() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  // QR d'une table (`/q/{code}?table=T5`) : la table est transmise à la page du restaurant.
  const table = tableParam(useSearchParams().get("table"));

  const query = useQuery({
    queryKey: ["qr", code],
    queryFn: () => unwrap(api.GET("/api/public/qr/{code}", { params: { path: { code } } })),
    staleTime: 0,
  });

  const target = query.data?.active && query.data.restaurant_slug ? query.data.restaurant_slug : null;
  useEffect(() => {
    if (target) router.replace(`/r/${target}?src=qr${table ? `&table=${encodeURIComponent(table)}` : ""}`);
  }, [target, table, router]);

  let content: React.ReactNode;
  if (query.isPending || target) {
    content = (
      <div role="status" className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p>Ouverture du menu…</p>
      </div>
    );
  } else if (query.isError) {
    const unknown = query.error instanceof ApiError && query.error.status === 404;
    content = (
      <EmptyState
        icon={QrCode}
        title={unknown ? "QR Code inconnu" : "Impossible de vérifier ce QR Code"}
        description={
          unknown
            ? "Ce QR Code n'est associé à aucun restaurant. Demandez de l'aide au personnel."
            : errorMessage(query.error)
        }
        action={
          unknown ? (
            <Button asChild variant="outline">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          ) : (
            <Button onClick={() => query.refetch()}>Réessayer</Button>
          )
        }
      />
    );
  } else {
    const { restaurant_name, restaurant_slug } = query.data;
    content = (
      <EmptyState
        icon={Store}
        title="Commande momentanément indisponible"
        description={
          restaurant_name
            ? `La commande en ligne de ${restaurant_name} est momentanément indisponible.`
            : "La commande en ligne de ce restaurant est momentanément indisponible."
        }
        action={
          restaurant_slug ? (
            <Button asChild>
              <Link href={`/r/${restaurant_slug}`}>Voir le menu</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/30 p-4">
      <Logo className="text-xl" />
      <div className="w-full max-w-md">{content}</div>
    </main>
  );
}
