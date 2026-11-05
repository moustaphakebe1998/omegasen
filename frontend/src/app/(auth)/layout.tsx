import { ChefHat, QrCode, Wallet } from "lucide-react";

import { Logo } from "@/components/shared/app-shell";

const FEATURES = [
  { icon: QrCode, label: "QR Code unique", tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300" },
  { icon: ChefHat, label: "Cuisine en direct", tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300" },
  { icon: Wallet, label: "Caisse tactile", tone: "bg-green-50 text-green-600 dark:bg-green-950/60 dark:text-green-300" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-muted/30 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Visuel : la photo occupe son propre bloc, aucun texte par-dessus. */}
      <aside className="hidden flex-col gap-5 p-6 lg:flex" aria-hidden>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border bg-muted shadow-sm">
          <img src="/landing/kitchen.webp" alt="" className="absolute inset-0 size-full object-cover" />
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {FEATURES.map(({ icon: Icon, label, tone }) => (
            <li key={label} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="size-4.5" />
              </span>
              <span className="text-sm font-medium">{label}</span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex flex-col items-center justify-center gap-6 px-4 py-8 sm:px-8">
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border bg-muted shadow-sm lg:hidden" aria-hidden>
          <img src="/landing/kitchen.webp" alt="" className="aspect-[16/7] w-full object-cover" />
        </div>
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Logo className="text-xl" />
          {children}
        </div>
      </main>
    </div>
  );
}
