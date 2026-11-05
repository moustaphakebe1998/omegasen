"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Lien d'activation à transmettre au nouveau propriétaire (aucun email n'est envoyé automatiquement). */
export function ActivationLink({ url, email }: { url: string; email: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="size-4 shrink-0" aria-hidden /> Lien d&apos;activation pour {email}
      </p>
      <p className="text-sm">
        Transmettez ce lien au propriétaire (email, WhatsApp…). Il lui permet de choisir son mot de passe. Valable 7
        jours, utilisable une seule fois. Il ne sera plus affiché ensuite.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          aria-label="Lien d'activation"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 font-mono text-xs text-foreground"
        />
        <Button type="button" variant="outline" onClick={copy} className="shrink-0">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copié" : "Copier"}
        </Button>
      </div>
    </div>
  );
}
