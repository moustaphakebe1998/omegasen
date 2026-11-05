"use client";

import { ReadOnlyHint } from "@/components/manage/layout/permissions";
import { CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Champ de formulaire : libellé + aide + message d'erreur (ids `${id}-hint` / `${id}-err`). */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Props ARIA pour relier un champ à son aide / son erreur. */
export function aria(id: string, error?: string, hint = false) {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ");
  return { id, "aria-invalid": !!error, "aria-describedby": ids || undefined };
}

export function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

/** Titre de section avec la mention « Lecture seule » quand l'utilisateur ne peut pas la modifier. */
export function SectionTitle({ children, readOnly }: { children: React.ReactNode; readOnly?: boolean }) {
  return (
    <CardTitle className="flex flex-wrap items-center gap-2">
      {children}
      {readOnly && <ReadOnlyHint />}
    </CardTitle>
  );
}

/**
 * Désactive tous les champs d'une section non modifiable tout en gardant les valeurs lisibles
 * (pas d'opacité réduite : c'est une présentation en lecture seule, pas un champ en attente).
 */
export function ReadOnlyFieldset({
  readOnly,
  className,
  children,
}: {
  readOnly: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      disabled={readOnly}
      className={cn(
        "m-0 min-w-0 border-0 p-0",
        readOnly &&
          "[&_:disabled]:cursor-default [&_:disabled]:opacity-100 [&_[data-disabled]]:opacity-100 [&_input:disabled]:bg-muted/40 [&_textarea:disabled]:bg-muted/40",
        className,
      )}
    >
      {children}
    </fieldset>
  );
}
