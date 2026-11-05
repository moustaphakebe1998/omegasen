import {
  ArrowRight,
  BarChart3,
  BellRing,
  ChefHat,
  CircleCheck,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Play,
  QrCode,
  ScanLine,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Store,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { RecentOrders } from "@/components/public/recent-orders";
import { RestaurantSearch } from "@/components/public/restaurant-search";
import { Logo } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: QrCode,
    title: "QR Code Restaurant",
    subtitle: "Un QR Code unique par restaurant",
    image: "/landing/qr.webp",
    points: ["Accès direct au menu", "Commande en quelques clics", "QR Code personnalisable"],
    tone: "blue",
  },
  {
    icon: ChefHat,
    title: "Interface Cuisine",
    subtitle: "Suivez et préparez les commandes",
    image: "/landing/kitchen.webp",
    points: ["Mises à jour en temps réel", "Alertes sonores", "Gestion des statuts"],
    tone: "green",
  },
  {
    icon: Wallet,
    title: "Interface Caisse",
    subtitle: "Prenez les commandes rapidement",
    image: "/landing/pos.webp",
    points: ["Commande rapide", "Encaissement et rendu de monnaie", "Simple et intuitive"],
    tone: "violet",
  },
  {
    icon: Store,
    title: "Espace Restaurateur",
    subtitle: "Gérez votre établissement",
    image: "/landing/manager.webp",
    points: ["Gestion des menus", "Suivi des commandes", "Statistiques détaillées"],
    tone: "orange",
  },
  {
    icon: Smartphone,
    title: "Espace Client",
    subtitle: "Découvrez et commandez",
    image: "/landing/client.webp",
    points: ["Menu interactif", "Commande en ligne", "Suivi en temps réel"],
    tone: "teal",
  },
] as const;

const TONES = {
  blue: { card: "from-blue-50", icon: "bg-blue-600", check: "text-blue-600" },
  green: {
    card: "from-green-50",
    icon: "bg-green-600",
    check: "text-green-600",
  },
  violet: {
    card: "from-violet-50",
    icon: "bg-violet-600",
    check: "text-violet-600",
  },
  orange: {
    card: "from-orange-50",
    icon: "bg-orange-500",
    check: "text-orange-500",
  },
  teal: { card: "from-teal-50", icon: "bg-teal-600", check: "text-teal-600" },
} as const;

const STEPS = [
  {
    icon: ScanLine,
    title: "Scannez",
    text: "Le QR Code posé sur la table ou au comptoir.",
  },
  {
    icon: ShoppingBag,
    title: "Commandez",
    text: "Choisissez vos plats et options, sans application.",
  },
  {
    icon: BellRing,
    title: "Récupérez",
    text: "Suivez la préparation en direct jusqu'à ce que ce soit prêt.",
  },
];

const STACK = ["Next.js", "FastAPI", "PostgreSQL", "Docker", "MinIO"];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav
            className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex"
            aria-label="Navigation"
          >
            <a href="#fonctionnalites" className="hover:text-foreground">
              Fonctionnalités
            </a>
            <a href="#comment" className="hover:text-foreground">
              Comment ça marche
            </a>
            <a href="#restaurants" className="hover:text-foreground">
              Restaurants
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Se connecter</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/demande">Ouvrir mon restaurant</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* ── Hero ───────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-background to-background dark:from-orange-950/20">
          <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 pt-12 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:pt-20 lg:pb-24">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <QrCode className="size-4" aria-hidden /> Un QR Code, toutes vos commandes
              </p>
              <h1 className="mt-5 text-4xl leading-[1.1] font-black tracking-tight text-balance sm:text-5xl">
                La plateforme intelligente de gestion des <span className="text-primary">restaurants</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground">
                Une solution <strong className="text-foreground">complète</strong> et{" "}
                <strong className="text-foreground">moderne</strong> pour gérer votre restaurant, vos commandes et votre
                cuisine en toute simplicité.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-12 rounded-full px-6 text-base shadow-lg shadow-primary/25">
                  <Link href="/demande">
                    Demander l&apos;ouverture <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-base">
                  <Link href="/demo">
                    <Play className="fill-current" aria-hidden /> Voir la démo
                  </Link>
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-2" aria-label="Technologies">
                {STACK.map((t) => (
                  <li
                    key={t}
                    className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              {/* Photo décorative derrière l'aperçu (débordement masqué par la section). */}
              <img
                src="/landing/hero.webp"
                alt=""
                className="pointer-events-none absolute -top-16 -right-24 hidden size-80 rounded-full object-cover opacity-90 shadow-2xl lg:block"
              />
              <DashboardPreview />
            </div>
          </div>
        </section>

        {/* ── Fonctionnalités ────────────────────────────── */}
        <section id="fonctionnalites" aria-labelledby="features-title" className="scroll-mt-20 py-16">
          <div className="mx-auto w-full max-w-7xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="features-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
                Tout votre restaurant, connecté
              </h2>
              <p className="mt-3 text-muted-foreground">
                Cinq espaces qui partagent les mêmes commandes, en temps réel.
              </p>
            </div>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {FEATURES.map((f) => {
                const tone = TONES[f.tone];
                return (
                  <li
                    key={f.title}
                    className={cn(
                      "flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b to-card shadow-sm dark:from-card",
                      tone.card,
                    )}
                  >
                    <div className="flex items-center gap-3 p-4">
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-xl text-white",
                          tone.icon,
                        )}
                      >
                        <f.icon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-tight">{f.title}</h3>
                        <p className="text-xs text-muted-foreground">{f.subtitle}</p>
                      </div>
                    </div>
                    <div className="mx-4 aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                      <img src={f.image} alt="" loading="lazy" className="size-full object-cover" />
                    </div>
                    <ul className="space-y-2 p-4 text-sm">
                      {f.points.map((p) => (
                        <li key={p} className="flex items-start gap-2">
                          <CircleCheck className={cn("mt-0.5 size-4 shrink-0", tone.check)} aria-hidden />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ── Comment ça marche (clients) ────────────────── */}
        <section id="comment" aria-labelledby="steps-title" className="scroll-mt-20 bg-muted/40 py-16">
          <div className="mx-auto w-full max-w-7xl px-4">
            <h2 id="steps-title" className="text-center text-3xl font-bold tracking-tight">
              Commander, côté client
            </h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <s.icon className="size-6" aria-hidden />
                  </span>
                  <div>
                    <p className="text-lg font-semibold">
                      {i + 1}. {s.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="flex flex-col gap-12 py-16">
          <RecentOrders />
          <RestaurantSearch />
        </div>

        {/* ── Bandeau final ──────────────────────────────── */}
        <section aria-labelledby="cta-title" className="mx-auto w-full max-w-7xl px-4 pb-16">
          <div className="flex flex-col items-start gap-5 rounded-2xl bg-neutral-900 p-6 text-white sm:p-8 md:flex-row md:items-center md:justify-between dark:bg-neutral-800">
            <div className="flex items-start gap-4">
              <Zap className="mt-1 size-7 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
              <div>
                <h2 id="cta-title" className="text-xl font-semibold sm:text-2xl">
                  OmegaSen, l&apos;allié de votre restaurant
                </h2>
                <p className="mt-1 text-neutral-300">
                  Une gestion simple, efficace et moderne. Prêt en quelques minutes.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/demande">Ouvrir mon restaurant</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/login">Se connecter</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} OmegaSen · Gestion et commande en ligne pour restaurants
      </footer>
    </div>
  );
}

/* ── Aperçu du tableau de bord (illustration en HTML, pas une capture) ── */

const PREVIEW_NAV = [
  { icon: LayoutDashboard, label: "Tableau de bord", active: true },
  { icon: ClipboardList, label: "Commandes" },
  { icon: UtensilsCrossed, label: "Menus" },
  { icon: QrCode, label: "QR Code" },
  { icon: ChefHat, label: "Cuisine" },
  { icon: BarChart3, label: "Statistiques" },
  { icon: Settings, label: "Paramètres" },
];

const PREVIEW_KPIS = [
  {
    label: "Commandes aujourd'hui",
    value: "128",
    delta: "+12 %",
    icon: ShoppingCart,
    tone: "bg-blue-50 text-blue-600",
  },
  {
    label: "Chiffre d'affaires",
    value: "2 847 €",
    delta: "+18 %",
    icon: CreditCard,
    tone: "bg-green-50 text-green-600",
  },
  {
    label: "Clients servis",
    value: "122",
    delta: "+15 %",
    icon: Users,
    tone: "bg-violet-50 text-violet-600",
  },
];

const PREVIEW_ORDERS = [
  {
    n: "042",
    status: "En cuisine",
    tone: "bg-amber-100 text-amber-800",
    ago: "2 min",
  },
  {
    n: "041",
    status: "Nouvelle",
    tone: "bg-blue-100 text-blue-800",
    ago: "3 min",
  },
  {
    n: "040",
    status: "Prête",
    tone: "bg-green-100 text-green-800",
    ago: "5 min",
  },
  {
    n: "039",
    status: "Terminée",
    tone: "bg-neutral-200 text-neutral-700",
    ago: "8 min",
  },
];

// Courbes (coordonnées dans un repère 300 × 100).
const TODAY = [70, 62, 55, 58, 40, 46, 30, 36, 22, 28, 12, 18];
const YESTERDAY = [78, 74, 70, 66, 62, 64, 55, 58, 50, 52, 45, 48];
const toPath = (ys: number[]) =>
  ys.map((y, i) => `${i === 0 ? "M" : "L"}${(i / (ys.length - 1)) * 300},${y}`).join(" ");

function DashboardPreview() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl ring-1 ring-black/5"
      role="img"
      aria-label="Aperçu du tableau de bord restaurateur"
    >
      <div className="flex">
        <div className="hidden w-40 shrink-0 flex-col gap-1 bg-neutral-900 p-3 text-neutral-300 sm:flex">
          <div className="mb-3 flex items-center gap-2 px-1 text-sm font-bold text-white">
            <ChefHat className="size-4 text-primary" aria-hidden /> OmegaSen
          </div>
          {PREVIEW_NAV.map((n) => (
            <div
              key={n.label}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]",
                n.active ? "bg-primary text-white" : "",
              )}
            >
              <n.icon className="size-3.5" aria-hidden />
              {n.label}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1 bg-neutral-50 p-3 sm:p-4 dark:bg-neutral-900/40">
          <div className="mb-3 flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold">Le Baobab</span>
            <span className="flex shrink-0 items-center gap-1 text-green-700 dark:text-green-400">
              <span className="size-1.5 rounded-full bg-green-500" aria-hidden /> En ligne
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {PREVIEW_KPIS.map((k) => (
              <div key={k.label} className="rounded-xl border bg-card p-2.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[10px] leading-tight text-muted-foreground">{k.label}</p>
                  <span
                    className={cn("hidden size-6 shrink-0 items-center justify-center rounded-full sm:flex", k.tone)}
                  >
                    <k.icon className="size-3" aria-hidden />
                  </span>
                </div>
                <p className="tabular mt-1 text-base font-bold sm:text-lg">{k.value}</p>
                <p className="flex items-center gap-0.5 text-[10px] font-medium text-green-600">
                  <TrendingUp className="size-3" aria-hidden /> {k.delta}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-[1.3fr_1fr]">
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">Évolution des commandes</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-primary" aria-hidden />
                    Aujourd&apos;hui
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-neutral-300" aria-hidden />
                    Hier
                  </span>
                </span>
              </div>
              <svg viewBox="0 0 300 100" className="mt-2 h-24 w-full" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="preview-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d={toPath(YESTERDAY)}
                  fill="none"
                  stroke="#d4d4d4"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <path d={`${toPath(TODAY)} L300,100 L0,100 Z`} fill="url(#preview-fill)" />
                <path
                  d={toPath(TODAY)}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-[11px] font-semibold">Commandes récentes</p>
              <ul className="mt-2 space-y-1.5">
                {PREVIEW_ORDERS.map((o) => (
                  <li key={o.n} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="tabular font-medium">#{o.n}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", o.tone)}>{o.status}</span>
                    <span className="text-muted-foreground">{o.ago}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
