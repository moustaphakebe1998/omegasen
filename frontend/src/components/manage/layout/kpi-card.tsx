import { cn } from "@/lib/utils";

/** Teintes des pastilles d'icônes (même langage visuel que l'accueil). */
export const TONE = {
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
  green: "bg-green-50 text-green-600 dark:bg-green-950/60 dark:text-green-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300",
  red: "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-300",
  neutral: "bg-muted text-muted-foreground",
} as const;

export type Tone = keyof typeof TONE;

/** Pastille d'icône colorée. */
export function IconChip({
  icon: Icon,
  tone = "orange",
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONE[tone], className)}
    >
      <Icon className="size-5" />
    </span>
  );
}

/** Carte indicateur : pastille d'icône à gauche, libellé, valeur et précision. */
export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "orange",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <IconChip icon={icon} tone={tone} className="hidden sm:flex" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs leading-tight font-medium text-muted-foreground">
          <IconChip icon={icon} tone={tone} className="size-7 rounded-lg sm:hidden [&_svg]:size-4" />
          <span className="min-w-0">{label}</span>
        </p>
        <p className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
