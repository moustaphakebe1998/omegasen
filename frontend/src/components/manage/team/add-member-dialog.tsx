"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  CircleCheck,
  KeyRound,
  Loader2,
  Mail,
  MessageCircleWarning,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ActivationResult } from "@/components/admin/activation-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, unwrap } from "@/lib/api/client";
import { ROLE, type MemberRole } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { PermissionGrid, PermissionLegend } from "./permission-grid";
import {
  type Catalog,
  type Member,
  type Perm,
  roleDefaults,
  sameSet,
  type Station,
  teamErrorMessage,
} from "./team-data";
import { LockNote, PasswordStrength, RoleOptions } from "./team-ui";

const NO_STATION = "none";

const schema = z
  .object({
    email: z.string().trim().email("Adresse email invalide"),
    full_name: z.string().trim().min(2, "Nom requis (2 caractères minimum)").max(120),
    phone: z
      .string()
      .trim()
      .max(32)
      .refine((v) => !v || /^[0-9+ ().-]{6,32}$/.test(v), "Numéro de téléphone invalide"),
    role: z.enum(["OWNER", "MANAGER", "CASHIER", "KITCHEN"]),
    mode: z.enum(["invite", "password"]),
    password: z.string(),
    confirm: z.string(),
    station: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.mode !== "password") return;
    if (v.password.length < 10)
      ctx.addIssue({ code: "custom", path: ["password"], message: "10 caractères minimum" });
    else if (v.password.length > 200)
      ctx.addIssue({ code: "custom", path: ["password"], message: "200 caractères maximum" });
    if (v.confirm !== v.password)
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "Les mots de passe ne correspondent pas" });
  });
type Values = z.infer<typeof schema>;

type Props = {
  rid: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grantableRoles: MemberRole[];
  canGrant: (p: Perm) => boolean;
  catalog: Catalog | undefined;
  stations: Station[];
  onAdded: (m: Member) => void;
};

export function AddMemberDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {props.open && <AddMemberForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

type Result = { member: Member; mode: Values["mode"] };

function AddMemberForm({ rid, onOpenChange, grantableRoles, canGrant, catalog, stations, onAdded }: Props) {
  const [step, setStep] = useState<"identity" | "permissions">("identity");
  const [custom, setCustom] = useState<Set<Perm> | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultRole: MemberRole = grantableRoles.includes("CASHIER") ? "CASHIER" : grantableRoles[0];
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      full_name: "",
      phone: "",
      role: defaultRole,
      mode: "invite",
      password: "",
      confirm: "",
      station: NO_STATION,
    },
  });
  const errors = form.formState.errors;
  const role = form.watch("role");
  const mode = form.watch("mode");
  const password = form.watch("password");
  const defaults = roleDefaults(catalog, role);
  const customized = !!custom && role !== "OWNER" && !sameSet(custom, defaults);

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const m = await unwrap(
        api.POST("/api/restaurants/{restaurant_id}/members", {
          params: { path: { restaurant_id: rid } },
          body: {
            email: v.email.trim(),
            full_name: v.full_name.trim(),
            role: v.role,
            phone: v.phone.trim() || null,
            mode: v.mode,
            password: v.mode === "password" ? v.password : null,
            permissions: customized && custom ? [...custom] : null,
            station_id: v.station === NO_STATION ? null : v.station,
          },
        }),
      );
      onAdded(m);
      toast.success(`${m.full_name} a été ajouté·e à l'équipe`);
      setResult({ member: m, mode: v.mode });
    } catch (e) {
      setError(teamErrorMessage(e, catalog));
      setStep("identity");
    }
  });

  if (result) return <AddResult result={result} onClose={() => onOpenChange(false)} />;

  const goPermissions = async () => {
    if (!(await form.trigger())) return;
    if (!custom) setCustom(roleDefaults(catalog, role));
    setStep("permissions");
  };

  const submitLabel = mode === "invite" ? "Envoyer l'invitation" : "Créer le compte";

  if (step === "permissions" && catalog) {
    return (
      <form onSubmit={submit} noValidate className="grid min-w-0 gap-4">
        <DialogHeader>
          <DialogTitle>Personnaliser les permissions</DialogTitle>
          <DialogDescription>
            Préremplies avec les permissions du rôle « {ROLE[role]} ». Décochez ce que cette personne ne doit pas
            faire, ou accordez-lui des droits supplémentaires.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PermissionLegend />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!customized}
            onClick={() => setCustom(roleDefaults(catalog, role))}
          >
            Revenir aux permissions du rôle
          </Button>
        </div>
        {role === "OWNER" ? (
          <LockNote>Un administrateur du restaurant a toujours toutes les permissions.</LockNote>
        ) : (
          <PermissionGrid
            catalog={catalog}
            value={custom ?? defaults}
            onChange={setCustom}
            defaults={defaults}
            canGrant={canGrant}
            singleColumn
          />
        )}
        {error && <FormError message={error} />}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setStep("identity")}>
            <ArrowLeft aria-hidden />
            Retour
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid min-w-0 gap-4">
      <DialogHeader>
        <DialogTitle>Ajouter un collaborateur</DialogTitle>
        <DialogDescription>
          Si cette personne a déjà un compte OmegaSen, elle est simplement ajoutée à l&apos;équipe et garde son mot de
          passe.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="am-name" label="Nom complet" error={errors.full_name?.message}>
          <Input id="am-name" autoComplete="off" autoFocus aria-invalid={!!errors.full_name} {...form.register("full_name")} />
        </Field>
        <Field id="am-email" label="Email" error={errors.email?.message}>
          <Input id="am-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field id="am-phone" label="Téléphone" optional error={errors.phone?.message}>
          <Input
            id="am-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            aria-invalid={!!errors.phone}
            {...form.register("phone")}
          />
        </Field>
        <Field id="am-station" label="Poste" optional>
          <Controller
            control={form.control}
            name="station"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="am-station" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATION}>Aucun poste</SelectItem>
                  {stations.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <Field id="am-role" label="Rôle">
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                setCustom(null); // les permissions repartent de celles du nouveau rôle
              }}
            >
              <SelectTrigger id="am-role" className="w-full">
                <SelectValue>{ROLE[field.value]}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-[min(26rem,calc(100vw-2rem))]">
                <RoleOptions roles={grantableRoles} />
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Mode de création</legend>
        <Controller
          control={form.control}
          name="mode"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Mode de création" className="grid gap-2 sm:grid-cols-2">
              <ModeOption
                checked={field.value === "invite"}
                onSelect={() => field.onChange("invite")}
                icon={Mail}
                title="Inviter par email"
                badge="Recommandé"
                text="La personne reçoit un lien et choisit elle-même son mot de passe."
              />
              <ModeOption
                checked={field.value === "password"}
                onSelect={() => field.onChange("password")}
                icon={KeyRound}
                title="Créer le compte directement"
                text="Vous définissez un mot de passe initial, à changer à la première connexion."
              />
            </div>
          )}
        />
      </fieldset>

      {mode === "password" && (
        <div className="grid gap-4 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-2">
          <Field id="am-password" label="Mot de passe initial" error={errors.password?.message}>
            <Input
              id="am-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby="am-password-hint"
              {...form.register("password")}
            />
          </Field>
          <Field id="am-confirm" label="Confirmer le mot de passe" error={errors.confirm?.message}>
            <Input
              id="am-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...form.register("confirm")}
            />
          </Field>
          <div className="sm:col-span-2">
            <PasswordStrength password={password} id="am-password-hint" />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          <SlidersHorizontal className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Permissions</p>
          <p className="text-muted-foreground">
            {role === "OWNER"
              ? "Toutes les permissions (administrateur)."
              : customized
                ? `Personnalisées : ${custom!.size} permission${custom!.size > 1 ? "s" : ""}.`
                : `Celles du rôle « ${ROLE[role]} ».`}
          </p>
        </div>
        {role !== "OWNER" && (
          <Button type="button" variant="outline" size="sm" onClick={goPermissions} disabled={!catalog}>
            Personnaliser les permissions
          </Button>
        )}
      </div>

      {error && <FormError message={error} />}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">(facultatif)</span>}
      </Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
      {message}
    </p>
  );
}

function ModeOption({
  checked,
  onSelect,
  icon: Icon,
  title,
  text,
  badge,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        checked ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/60",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          {title}
          {badge && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

function AddResult({ result, onClose }: { result: Result; onClose: () => void }) {
  const m = result.member;
  const invited = !!m.activation_url || !!m.email_sent;
  const direct = !invited && result.mode === "password" && m.must_change_password;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{m.full_name} a été ajouté·e</DialogTitle>
        <DialogDescription>
          {ROLE[m.role]}
          {m.station_name ? ` · ${m.station_name}` : ""}
        </DialogDescription>
      </DialogHeader>
      {invited ? (
        <ActivationResult url={m.activation_url} email={m.email} emailSent={m.email_sent} />
      ) : direct ? (
        <div className="flex items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 p-4 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
            <MessageCircleWarning className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-semibold">Compte créé</p>
            <p>
              Communiquez le mot de passe initial de vive voix ; il devra le changer à sa première connexion.
            </p>
            <p className="break-words text-sky-900/80 dark:text-sky-100/80">
              Identifiant : <strong>{m.email}</strong>. Aucun email n&apos;est envoyé.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-green-300 bg-green-50 p-4 text-green-950 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white">
            <UserCheck className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1 text-sm">
            <p className="font-semibold">Compte existant ajouté</p>
            <p className="break-words">
              {m.email} avait déjà un compte OmegaSen : il retrouvera ce restaurant à sa prochaine connexion, avec son
              mot de passe habituel.
            </p>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button type="button" onClick={onClose} autoFocus>
          <CircleCheck aria-hidden />
          Terminé
        </Button>
      </DialogFooter>
    </>
  );
}
