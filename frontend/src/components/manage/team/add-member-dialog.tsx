"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { api, ApiError, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
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
  const [role, setRole] = useState<MemberRole>(grantableRoles.includes("CASHIER") ? "CASHIER" : grantableRoles[0]);
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) e.email = "Adresse email invalide";
    if (fullName.trim().length < 2) e.full_name = "Nom requis";
    if (needPassword && password.length < 10) e.password = "10 caractères minimum";
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
          body: {
            email: email.trim(),
            full_name: fullName.trim(),
            role,
            password: needPassword ? password : null,
          },
        }),
      );
      toast.success(`${m.full_name} a rejoint l'équipe`);
      onAdded(m);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "password_required") {
        setNeedPassword(true);
        setErrors({ password: "Aucun compte n'existe pour cet email : définissez un mot de passe initial." });
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ajouter un membre</DialogTitle>
        <DialogDescription>
          Si la personne a déjà un compte OmegaSen, elle retrouvera ce restaurant à sa prochaine connexion.
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
            onChange={(e) => {
              setEmail(e.target.value);
              setNeedPassword(false);
            }}
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
        {needPassword && (
          <div className="space-y-2">
            <Label htmlFor="am-password">Mot de passe initial</Label>
            <Input
              id="am-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              aria-invalid={!!errors.password}
              aria-describedby="am-password-help"
              onChange={(e) => setPassword(e.target.value)}
            />
            <p id="am-password-help" className={errors.password ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
              {errors.password ?? "Communiquez-le à la personne ; elle pourra le changer ensuite."}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Ajouter
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
