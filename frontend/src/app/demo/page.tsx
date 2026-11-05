import {
  ArrowRight,
  BarChart3,
  ChefHat,
  CircleCheck,
  KeyRound,
  QrCode,
  ShieldCheck,
  Smartphone,
  Store,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Démo — OmegaSen",
  description: "Visite guidée d'OmegaSen sur le restaurant de démonstration Le Baobab.",
};

const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_SLUG ?? "le-baobab-demo";
const DEMO_PASSWORD = "Demo!2026pass";

type Frame = "phone" | "tablet" | "laptop";

/** Captures réelles des interfaces (restaurant de démo), générées par `npm run demo:screens`. */
const TOUR: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  kicker: string;
  title: string;
  text: string;
  points: string[];
  image: string;
  frame: Frame;
  cta?: { label: string; href: string };
}[] = [
  {
    id: "client",
    icon: Smartphone,
    tone: "bg-teal-100 text-teal-700",
    kicker: "Espace client",
    title: "Le menu dans la poche de vos clients",
    text: "Le client scanne le QR Code de la table : il parcourt la carte avec photos, choisit ses options et commande sans installer d'application.",
    points: ["Photos et descriptions des plats", "Options et suppléments", "Suivi de la commande en direct"],
    image: "/demo/client-menu.webp",
    frame: "phone",
    cta: { label: "Ouvrir le menu du Baobab", href: `/r/${DEMO_SLUG}` },
  },
  {
    id: "qr",
    icon: QrCode,
    tone: "bg-blue-100 text-blue-700",
    kicker: "QR Code unique",
    title: "Un QR Code permanent par restaurant",
    text: "Imprimé une seule fois en affiche ou en chevalet : il reste valable même quand vous changez votre carte, vos prix ou votre nom.",
    points: ["PNG, SVG et PDF prêts à imprimer", "Logo au centre, couleurs personnalisées", "Nombre de scans suivi"],
    image: "/demo/manage-qr.webp",
    frame: "laptop",
  },
  {
    id: "cuisine",
    icon: ChefHat,
    tone: "bg-green-100 text-green-700",
    kicker: "Écran cuisine",
    title: "La cuisine voit tout, en temps réel",
    text: "Chaque commande arrive instantanément sur la tablette de la cuisine, avec une alerte sonore. Les retards sont signalés et le passage en « Prête » prévient la salle.",
    points: ["Nouvelles, en préparation, prêtes", "Alertes et commandes en retard", "Filtre par poste (grill, bar…)"],
    image: "/demo/kitchen.webp",
    frame: "tablet",
  },
  {
    id: "caisse",
    icon: Wallet,
    tone: "bg-violet-100 text-violet-700",
    kicker: "Caisse",
    title: "Une caisse tactile simple et rapide",
    text: "Prise de commande au guichet, encaissement en espèces, carte ou Mobile Money avec rendu de monnaie, ticket imprimable et réservations du jour.",
    points: ["Commande en quelques touches", "Paiement séparé de la préparation", "Ticket 80 mm"],
    image: "/demo/pos.webp",
    frame: "tablet",
  },
  {
    id: "restaurateur",
    icon: Store,
    tone: "bg-orange-100 text-orange-700",
    kicker: "Espace restaurateur",
    title: "Pilotez votre établissement",
    text: "Menu, photos, horaires, équipe, réservations et statistiques : le responsable gère tout son restaurant et invite son équipe, qui choisit son propre mot de passe.",
    points: ["Chiffre d'affaires et panier moyen", "Équipe avec rôles et permissions", "Réservations en ligne"],
    image: "/demo/manage-overview.webp",
    frame: "laptop",
  },
  {
    id: "admin",
    icon: ShieldCheck,
    tone: "bg-neutral-200 text-neutral-800",
    kicker: "Super administration",
    title: "Toute la plateforme sous contrôle",
    text: "L'équipe OmegaSen valide les demandes d'ouverture, crée les comptes, suit le chiffre d'affaires de chaque restaurant et consulte le journal d'activité.",
    points: ["Demandes d'ouverture", "Utilisateurs, rôles et statuts", "Chiffre d'affaires par restaurant"],
    image: "/demo/admin-revenue.webp",
    frame: "laptop",
  },
];

const ACCOUNTS = [
  {
    role: "Responsable / propriétaire",
    email: "owner@demo.example.com",
    icon: BarChart3,
    space: "Espace restaurateur",
  },
  { role: "Cuisine", email: "cuisine@demo.example.com", icon: ChefHat, space: "Écran cuisine" },
  { role: "Caisse", email: "caisse@demo.example.com", icon: Wallet, space: "Caisse et réservations" },
];

function DeviceFrame({ frame, src, alt }: { frame: Frame; src: string; alt: string }) {
  if (frame === "phone") {
    return (
      <div className="mx-auto w-full max-w-[280px] rounded-[2.5rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl">
        <div className="aspect-[390/844] overflow-hidden rounded-[1.8rem] bg-background">
          <img src={src} alt={alt} loading="lazy" className="size-full object-cover object-top" />
        </div>
      </div>
    );
  }
  if (frame === "tablet") {
    return (
      <div className="w-full rounded-[1.75rem] border-[12px] border-neutral-900 bg-neutral-900 shadow-2xl">
        <div className="aspect-[16/10] overflow-hidden rounded-xl bg-background">
          <img src={src} alt={alt} loading="lazy" className="size-full object-cover object-top" />
        </div>
      </div>
    );
  }
  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-t-xl border border-b-0 bg-card shadow-2xl">
        <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2" aria-hidden>
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-green-400" />
        </div>
        <div className="aspect-[16/10] overflow-hidden bg-background">
          <img src={src} alt={alt} loading="lazy" className="size-full object-cover object-top" />
        </div>
      </div>
      <div
        className="mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-xl bg-neutral-300 dark:bg-neutral-700"
        aria-hidden
      />
    </div>
  );
}

export default function DemoPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav
            className="hidden items-center gap-5 text-sm font-medium text-muted-foreground lg:flex"
            aria-label="Visite"
          >
            {TOUR.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="hover:text-foreground">
                {t.kicker}
              </a>
            ))}
          </nav>
          <Button asChild size="sm">
            <a href="#essayer">Essayer</a>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Introduction ─────────────────────────────── */}
        <section className="bg-gradient-to-b from-orange-50 to-background dark:from-orange-950/20">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
            <div>
              <p className="text-sm font-semibold tracking-wide text-primary uppercase">Démonstration</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-balance sm:text-5xl">
                OmegaSen en action, au restaurant <span className="text-primary">Le Baobab</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground">
                Suivez une commande de bout en bout : du QR Code sur la table jusqu&apos;à la cuisine, la caisse et le
                tableau de bord. Toutes les images sont de vraies captures de l&apos;application.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 rounded-full px-6 text-base">
                  <Link href={`/r/${DEMO_SLUG}`}>
                    Commander comme un client <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-base">
                  <a href="#essayer">Accès personnel de démo</a>
                </Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-3xl shadow-2xl">
              <img
                src="/demo/baobab-cover.webp"
                alt="Plats du restaurant Le Baobab"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* ── Visite guidée ────────────────────────────── */}
        <div className="mx-auto w-full max-w-7xl space-y-20 px-4 py-16 lg:space-y-28">
          {TOUR.map((t, i) => (
            <section
              key={t.id}
              id={t.id}
              aria-labelledby={`${t.id}-title`}
              className="grid scroll-mt-24 gap-10 lg:grid-cols-2 lg:items-center"
            >
              <div className={cn(i % 2 === 1 && "lg:order-2")}>
                <span
                  className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", t.tone)}
                >
                  <t.icon className="size-4" aria-hidden />
                  {t.kicker}
                </span>
                <h2 id={`${t.id}-title`} className="mt-4 text-3xl font-bold tracking-tight">
                  {t.title}
                </h2>
                <p className="mt-3 text-muted-foreground">{t.text}</p>
                <ul className="mt-5 space-y-2">
                  {t.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                {t.cta && (
                  <Button asChild className="mt-6 rounded-full" variant="outline">
                    <Link href={t.cta.href}>
                      {t.cta.label} <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                )}
              </div>
              <div className={cn("min-w-0", i % 2 === 1 && "lg:order-1")}>
                <DeviceFrame frame={t.frame} src={t.image} alt={`Capture : ${t.kicker}`} />
              </div>
            </section>
          ))}
        </div>

        {/* ── Essayer ──────────────────────────────────── */}
        <section id="essayer" aria-labelledby="essayer-title" className="scroll-mt-20 bg-neutral-900 py-16 text-white">
          <div className="mx-auto w-full max-w-7xl px-4">
            <div className="max-w-2xl">
              <h2 id="essayer-title" className="text-3xl font-bold tracking-tight">
                Essayez avec les comptes de démonstration
              </h2>
              <p className="mt-3 text-neutral-300">
                Connectez-vous avec l&apos;un des comptes du restaurant Le Baobab (mot de passe{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-orange-200">{DEMO_PASSWORD}</code>).
                Ouvrez le menu client dans un autre onglet et passez une commande : elle apparaît aussitôt en cuisine.
              </p>
            </div>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {ACCOUNTS.map((a) => (
                <li key={a.email} className="flex flex-col rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
                    <a.icon className="size-5" aria-hidden />
                  </span>
                  <p className="mt-4 font-semibold">{a.role}</p>
                  <p className="text-sm text-neutral-400">{a.space}</p>
                  <p className="mt-3 flex items-center gap-2 font-mono text-sm break-all text-neutral-200">
                    <KeyRound className="size-4 shrink-0 text-orange-300" aria-hidden />
                    {a.email}
                  </p>
                  <Button asChild className="mt-5 w-full">
                    <Link href={`/login?email=${encodeURIComponent(a.email)}`}>Se connecter</Link>
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-neutral-400">
              Vous avez un restaurant ?{" "}
              <Link href="/demande" className="font-medium text-orange-300 underline-offset-4 hover:underline">
                Demandez l&apos;ouverture de votre espace
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} OmegaSen · Démonstration sur données fictives
      </footer>
    </div>
  );
}
