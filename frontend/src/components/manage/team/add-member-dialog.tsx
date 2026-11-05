"use client";

import { Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { api, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { ROLE, type MemberRole } from "@/lib/labels";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  rid: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grantableRoles: MemberRole[];
  onAdded: (m: Schemas["MemberOut"]) => void;
};

export function AddMemberDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">{props.open && <AddMemberForm {...props} />}</DialogContent>
    </Dialog>
  );
}

function AddMemberForm({ rid, onOpenChange, grantableRoles, onAdded }: Props) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<MemberRole>(grantableRoles.includes("CASHIER") ? "CASHIER" : grantableRoles[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Schemas["MemberOut"] | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) e.email = "Adresse email invalide";
    if (fullName.trim().length < 2) e.full_name = "Nom requis";
    if (phone.trim() && !/^[0-9+ ().-]{6,32}$/.test(phone.trim())) e.phone = "Numéro de téléphone invalide";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      const m = await unwrap(
        api.POST("/api/restaurants/{restaurant_id}/members", {
          params: { path: { restaurant_id: rid } },
          body: { email: email.trim(), full_name: fullName.trim(), role, phone: phone.trim() || null },
        }),
      );
      onAdded(m);
      if (m.activation_url || m.email_sent) {
        setAdded(m);
      } else {
        toast.success(`${m.full_name} a rejoint l'équipe`);
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (added) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{added.full_name} a été ajouté·e</DialogTitle>
          <DialogDescription>
            {ROLE[added.role]} · son accès sera actif dès qu&apos;elle ou il aura choisi son mot de passe.
          </DialogDescription>
        </DialogHeader>
        <ActivationResult url={added.activation_url} email={added.email} emailSent={added.email_sent} />
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)} autoFocus>
            Terminé
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ajouter un membre</DialogTitle>
        <DialogDescription>
          Une invitation est envoyée par email : la personne choisit elle-même son mot de passe. Si elle a déjà un
          compte OmegaSen, elle retrouvera ce restaurant à sa prochaine connexion.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="am-email">Email</Label>
          <Input
            id="am-email"
            type="email"
            autoComplete="off"
            autoFocus
            value={email}
            aria-invalid={!!errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="am-name">Nom complet</Label>
          <Input
            id="am-name"
            autoComplete="off"
            value={fullName}
            aria-invalid={!!errors.full_name}
            onChange={(e) => setFullName(e.target.value)}
          />
          {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="am-role">Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
              <SelectTrigger id="am-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {grantableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="am-phone">
              Téléphone <span className="font-normal text-muted-foreground">(facultatif)</span>
            </Label>
            <Input
              id="am-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              aria-invalid={!!errors.phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          Le lien d&apos;invitation est valable 7 jours. Vous pourrez le renvoyer depuis la liste de l&apos;équipe.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Inviter
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
