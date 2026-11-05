"use client";

import { Lock } from "lucide-react";
import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Catalog, Perm } from "./team-data";

const GROUP_TONES = [
  "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
];

const NO_GRANT = "Vous ne pouvez pas accorder une permission que vous n'avez pas vous-même.";

type Props = {
  catalog: Catalog;
  /** Permissions cochées. */
  value: Set<Perm>;
  onChange: (next: Set<Perm>) => void;
  /** Permissions par défaut du rôle (repère visuel « rôle »). */
  defaults: Set<Perm>;
  /** État enregistré : les lignes qui en diffèrent sont surlignées. */
  saved?: Set<Perm>;
  /** Grille entièrement en lecture seule (propriétaire, soi-même, lecture seule…). */
  disabled?: boolean;
  canGrant: (p: Perm) => boolean;
  /** Une seule colonne (dialogue). */
  singleColumn?: boolean;
};

/** Grille des permissions en 4 groupes, avec « tout cocher » par groupe. */
export function PermissionGrid({ catalog, value, onChange, defaults, saved, disabled, canGrant, singleColumn }: Props) {
  const uid = useId();
  const editable = (p: Perm) => !disabled && canGrant(p);

  const toggle = (p: Perm, on: boolean) => {
    const next = new Set(value);
    if (on) next.add(p);
    else next.delete(p);
    onChange(next);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("grid gap-4", !singleColumn && "xl:grid-cols-2")}>
        {catalog.groups.map((g, gi) => {
          const keys = g.items.map((i) => i.key);
          const toggleable = keys.filter(editable);
          const checkedCount = keys.filter((k) => value.has(k)).length;
          const allOn = checkedCount === keys.length;
          const groupId = `${uid}-g${gi}`;
          return (
            <fieldset key={g.label} className="min-w-0 rounded-2xl border bg-card">
              <legend className="sr-only">{g.label}</legend>
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    GROUP_TONES[gi % GROUP_TONES.length],
                  )}
                >
                  {gi + 1}
                </span>
                <p className="min-w-0 flex-1 font-semibold">{g.label}</p>
                <label
                  htmlFor={groupId}
                  className={cn(
                    "flex shrink-0 items-center gap-2 text-xs text-muted-foreground",
                    toggleable.length ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="tabular rounded-full bg-muted px-1.5 py-0.5 text-[11px]" aria-hidden>
                    {checkedCount}/{keys.length}
                  </span>
                  Tout cocher
                  <Checkbox
                    id={groupId}
                    checked={allOn}
                    disabled={toggleable.length === 0}
                    aria-label={`Tout cocher : ${g.label}`}
                    onCheckedChange={() => {
                      const next = new Set(value);
                      const turnOn = !toggleable.every((k) => value.has(k));
                      for (const k of toggleable) {
                        if (turnOn) next.add(k);
                        else next.delete(k);
                      }
                      onChange(next);
                    }}
                  />
                </label>
              </div>
              <ul className="divide-y">
                {g.items.map((it) => {
                  const id = `${uid}-${it.key}`;
                  const on = value.has(it.key);
                  const isDefault = defaults.has(it.key);
                  const custom = on !== isDefault;
                  const modified = saved ? on !== saved.has(it.key) : false;
                  const grantLocked = !disabled && !canGrant(it.key);
                  const box = (
                    <Checkbox
                      id={id}
                      checked={on}
                      disabled={!editable(it.key)}
                      onCheckedChange={(c) => toggle(it.key, c === true)}
                      aria-describedby={grantLocked ? `${id}-lock` : undefined}
                    />
                  );
                  return (
                    <li
                      key={it.key}
                      data-modified={modified || undefined}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 transition-colors",
                        modified && "bg-amber-50 dark:bg-amber-950/40",
                      )}
                    >
                      {grantLocked ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex" tabIndex={0}>
                              {box}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{NO_GRANT}</TooltipContent>
                        </Tooltip>
                      ) : (
                        box
                      )}
                      <label
                        htmlFor={id}
                        className={cn(
                          "min-w-0 flex-1 text-sm",
                          editable(it.key) ? "cursor-pointer" : "cursor-default text-muted-foreground",
                        )}
                      >
                        {it.label}
                        {grantLocked && (
                          <span id={`${id}-lock`} className="sr-only">
                            {` (${NO_GRANT})`}
                          </span>
                        )}
                      </label>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {grantLocked && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
                        {custom ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              on
                                ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
                            )}
                            title={on ? "Accordée en plus du rôle" : "Retirée par rapport au rôle"}
                          >
                            {on ? "Ajoutée" : "Retirée"}
                          </span>
                        ) : (
                          isDefault && (
                            <span
                              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                              title="Comprise dans le rôle"
                            >
                              Rôle
                            </span>
                          )
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/** Légende de la grille. */
export function PermissionLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Rôle</span> comprise dans le rôle
      </span>
      <span className="flex items-center gap-1.5">
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-800 dark:bg-violet-950 dark:text-violet-200">
          Ajoutée
        </span>
        /
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] text-rose-800 dark:bg-rose-950 dark:text-rose-200">
          Retirée
        </span>
        par rapport au rôle
      </span>
    </div>
  );
}
