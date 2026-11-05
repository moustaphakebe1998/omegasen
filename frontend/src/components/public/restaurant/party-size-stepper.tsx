"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Sélecteur du nombre de couverts (1 à 50). */
export function PartySizeStepper({
  id,
  value,
  onChange,
  min = 1,
  max = 50,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="rounded-full"
        aria-label="Une personne de moins"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus />
      </Button>
      <output id={id} aria-live="polite" className="tabular min-w-24 text-center text-lg font-semibold">
        {value} pers.
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="rounded-full"
        aria-label="Une personne de plus"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}
