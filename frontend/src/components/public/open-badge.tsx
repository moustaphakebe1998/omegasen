import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Pastille « Ouvert / Fermé » d'un restaurant. */
export function OpenBadge({ open, className }: { open: boolean; className?: string }) {
  return (
    <Badge
      className={cn(
        "border-transparent",
        open
          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
          : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
        className,
      )}
    >
      <span className={`size-1.5 rounded-full ${open ? "bg-green-600" : "bg-neutral-500"}`} aria-hidden />
      {open ? "Ouvert" : "Fermé"}
    </Badge>
  );
}
