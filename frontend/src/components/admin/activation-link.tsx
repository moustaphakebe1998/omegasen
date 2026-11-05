"use client";

import { Check, Copy, KeyRound, MailCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Lien d'activation à transmettre manuellement quand l'email n'a pas pu être envoyé. */
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
      <p className="flex items-start gap-2 text-sm font-semibold">
        <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">Lien d&apos;activation pour {email}</span>
      </p>
      <p className="text-sm">
        L&apos;email n&apos;a pas pu être envoyé : transmettez ce lien à la personne (email, WhatsApp…). Il lui permet
        de choisir son mot de passe. Valable 7 jours, utilisable une seule fois. Il ne sera plus affiché ensuite.
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

/** Confirmation : l'email d'activation est parti. */
export function ActivationSent({ email }: { email: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-green-300 bg-green-50 p-4 text-green-950 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white">
        <MailCheck className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">Email d&apos;activation envoyé</p>
        <p className="break-words">{email} a reçu un lien pour choisir son mot de passe (valable 7 jours).</p>
      </div>
    </div>
  );
}

/** Affiche la confirmation d'envoi ou, à défaut, le lien à transmettre. */
export function ActivationResult({
  url,
  email,
  emailSent,
}: {
  url: string | null | undefined;
  email: string;
  emailSent: boolean | null | undefined;
}) {
  if (emailSent) return <ActivationSent email={email} />;
  if (url) return <ActivationLink url={url} email={email} />;
  return null;
}
