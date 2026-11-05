"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Controller, type Control, type FieldErrors, useFieldArray, type UseFormRegister, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { ProductFormValues } from "./product-form";

type Props = {
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  currency: string;
};

function FieldMsg({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

function choiceHelp(min: number, max: number): string {
  if (Number.isNaN(min) || Number.isNaN(max)) return "";
  if (min === 1 && max === 1) return "Choix obligatoire unique (ex. cuisson, accompagnement).";
  if (min === 0) return max === 1 ? "Facultatif : le client peut choisir 1 option." : `Facultatif : jusqu'à ${max} options.`;
  if (min === max) return `Obligatoire : exactement ${min} options.`;
  return `Obligatoire : entre ${min} et ${max} options.`;
}

function GroupEditor({
  index,
  total,
  control,
  register,
  errors,
  currency,
  onMove,
  onRemove,
}: Props & { index: number; total: number; onMove: (delta: number) => void; onRemove: () => void }) {
  const { fields, append, remove, move } = useFieldArray({ control, name: `option_groups.${index}.options` });
  const min = useWatch({ control, name: `option_groups.${index}.min_choices` });
  const max = useWatch({ control, name: `option_groups.${index}.max_choices` });
  const name = useWatch({ control, name: `option_groups.${index}.name` });
  const gErr = errors.option_groups?.[index];
  const base = `og-${index}`;

  return (
    <fieldset className="grid gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{name || `Groupe ${index + 1}`}</legend>
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem]">
        <div className="grid gap-1">
          <Label htmlFor={`${base}-name`}>Nom du groupe</Label>
          <Input
            id={`${base}-name`}
            placeholder="Ex. Cuisson, Suppléments"
            aria-invalid={!!gErr?.name}
            {...register(`option_groups.${index}.name`)}
          />
          <FieldMsg message={gErr?.name?.message} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${base}-min`}>Minimum</Label>
          <Input
            id={`${base}-min`}
            type="number"
            min={0}
            max={20}
            inputMode="numeric"
            aria-invalid={!!gErr?.min_choices}
            {...register(`option_groups.${index}.min_choices`, { valueAsNumber: true })}
          />
          <FieldMsg message={gErr?.min_choices?.message} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${base}-max`}>Maximum</Label>
          <Input
            id={`${base}-max`}
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            aria-invalid={!!gErr?.max_choices}
            {...register(`option_groups.${index}.max_choices`, { valueAsNumber: true })}
          />
          <FieldMsg message={gErr?.max_choices?.message} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {choiceHelp(Number(min), Number(max))} Min 1 / max 1 = choix obligatoire unique ; min 0 = facultatif.
      </p>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Options</p>
        {fields.map((f, oi) => {
          const oErr = gErr?.options?.[oi];
          const ob = `${base}-o${oi}`;
          return (
            <div key={f.id} className="grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end">
              <div className="grid gap-1">
                <Label htmlFor={`${ob}-name`} className="text-xs">
                  Option {oi + 1}
                </Label>
                <Input
                  id={`${ob}-name`}
                  placeholder="Ex. Frites"
                  aria-invalid={!!oErr?.name}
                  {...register(`option_groups.${index}.options.${oi}.name`)}
                />
                <FieldMsg message={oErr?.name?.message} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`${ob}-price`} className="text-xs">
                  Supplément ({currency})
                </Label>
                <Input
                  id={`${ob}-price`}
                  inputMode="decimal"
                  placeholder="0"
                  aria-invalid={!!oErr?.price}
                  {...register(`option_groups.${index}.options.${oi}.price`)}
                />
                <FieldMsg message={oErr?.price?.message} />
              </div>
              <div className="flex items-center gap-2 sm:h-9">
                <Controller
                  control={control}
                  name={`option_groups.${index}.options.${oi}.is_available`}
                  render={({ field }) => (
                    <Switch id={`${ob}-av`} checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
                <Label htmlFor={`${ob}-av`} className="text-xs">
                  Disponible
                </Label>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Monter l'option ${oi + 1}`}
                  disabled={oi === 0}
                  onClick={() => move(oi, oi - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Descendre l'option ${oi + 1}`}
                  disabled={oi === fields.length - 1}
                  onClick={() => move(oi, oi + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Supprimer l'option ${oi + 1}`}
                  onClick={() => remove(oi)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}
        <FieldMsg message={gErr?.options?.root?.message ?? gErr?.options?.message} />
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ uid: null, name: "", price: "", is_available: true })}
          >
            <Plus />
            Ajouter une option
          </Button>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Monter le groupe ${index + 1}`}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Descendre le groupe ${index + 1}`}
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemove}>
              <Trash2 />
              Supprimer le groupe
            </Button>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

/** Éditeur des groupes d'options / suppléments d'un produit. */
export function OptionGroupsEditor(props: Props) {
  const { fields, append, remove, move } = useFieldArray({ control: props.control, name: "option_groups" });
  return (
    <div className="grid gap-3">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune option. Ajoutez un groupe pour proposer des choix (cuisson, accompagnement, suppléments…).
        </p>
      )}
      {fields.map((f, i) => (
        <GroupEditor
          key={f.id}
          {...props}
          index={i}
          total={fields.length}
          onMove={(d) => move(i, i + d)}
          onRemove={() => remove(i)}
        />
      ))}
      <FieldMsg message={props.errors.option_groups?.root?.message ?? props.errors.option_groups?.message} />
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({
              uid: null,
              name: "",
              min_choices: 0,
              max_choices: 1,
              options: [{ uid: null, name: "", price: "", is_available: true }],
            })
          }
        >
          <Plus />
          Ajouter un groupe d&apos;options
        </Button>
      </div>
    </div>
  );
}
