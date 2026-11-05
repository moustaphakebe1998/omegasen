import { BellRing, ChefHat, LayoutDashboard, QrCode, ScanLine, ShoppingBag, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import { RecentOrders } from "@/components/public/recent-orders";
import { RestaurantSearch } from "@/components/public/restaurant-search";
import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: ScanLine, title: "Scannez", text: "Le QR Code posé sur votre table ou au comptoir." },
  { icon: ShoppingBag, title: "Commandez", text: "Choisissez vos plats et options, sans attendre." },
  { icon: BellRing, title: "Récupérez", text: "Suivez votre commande en direct jusqu'à ce qu'elle soit prête." },
];

const PRO_FEATURES = [
  { icon: UtensilsCrossed, text: "Menu en ligne, photos, options et promotions" },
  { icon: QrCode, text: "QR Codes de table et borne de commande" },
  { icon: ChefHat, text: "Écran cuisine et caisse en temps réel" },
  { icon: LayoutDashboard, text: "Statistiques et suivi des ventes" },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4">
          <Logo />
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Espace pro</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-12 pb-16">
        <section className="bg-gradient-to-b from-primary/10 to-background">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:items-center md:py-20">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <QrCode className="size-4" aria-hidden /> Sans application, sans attente
              </p>
              <h1 className="text-3xl font-black tracking-tight text-balance sm:text-5xl">
                Commandez en scannant le QR Code de votre restaurant
              </h1>
              <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                Parcourez le menu, passez commande depuis votre téléphone et suivez sa préparation en temps réel.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <a href="#restaurants">Trouver un restaurant</a>
                </Button>
              </div>
            </div>
            <ol className="grid gap-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-start gap-4 rounded-xl border bg-card p-4 shadow-sm">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold">
                      {i + 1}. {s.title}
                    </p>
                    <p className="text-sm text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <RecentOrders />

        <RestaurantSearch />

        <section aria-labelledby="pro-title" className="mx-auto w-full max-w-6xl px-4">
          <div className="grid gap-6 rounded-2xl bg-neutral-900 p-6 text-white sm:p-10 md:grid-cols-2 md:items-center dark:bg-neutral-800">
            <div>
              <p className="text-sm font-semibold tracking-wide text-orange-300 uppercase">Restaurateurs</p>
              <h2 id="pro-title" className="mt-2 text-2xl font-bold sm:text-3xl">
                Digitalisez votre restaurant en quelques minutes
              </h2>
              <p className="mt-3 text-neutral-300">
                Recevez les commandes de vos clients directement en cuisine et à la caisse, en temps réel.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/register">Créer mon restaurant</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/login">Se connecter</Link>
                </Button>
              </div>
            </div>
            <ul className="grid gap-3">
              {PRO_FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <f.icon className="size-4 text-orange-300" aria-hidden />
                  </span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} OmegaSen · Commande en ligne pour restaurants
      </footer>
    </div>
  );
}
