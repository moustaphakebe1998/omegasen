"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { SERVICE_MODE } from "@/lib/labels";

const DURATION_S = 20;

/** Écran plein de confirmation sur borne : grand numéro de commande, retour auto au menu. */
export function KioskConfirmation({
  order,
  requirePrepayment,
  onDone,
}: {
  order: Schemas["PlacedOrderOut"];
  requirePrepayment: boolean;
  onDone: () => void;
}) {
  const [left, setLeft] = useState(DURATION_S);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    buttonRef.current?.focus();
    const started = Date.now();
    const t = setInterval(() => {
      const remaining = DURATION_S - Math.floor((Date.now() - started) / 1000);
      if (remaining <= 0) {
        clearInterval(t);
        done.current();
      } else {
        setLeft(remaining);
      }
    }, 250);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kiosk-confirm-title"
      aria-describedby="kiosk-confirm-desc"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-primary p-6 text-center text-primary-foreground"
    >
      <CheckCircle2 className="size-16" aria-hidden />
      <h2 id="kiosk-confirm-title" className="text-3xl font-bold md:text-4xl">
        Merci{order.customer_name ? ` ${order.customer_name}` : ""} !
      </h2>
      <div>
        <p className="text-lg font-medium uppercase opacity-90">
          Votre numéro de commande
        </p>
        <p
          className="tabular text-[7rem] leading-none font-black md:text-[10rem]"
          aria-live="polite"
        >
          {order.display_number}
        </p>
      </div>
      <p id="kiosk-confirm-desc" className="max-w-xl text-xl">
        {requirePrepayment
          ? "Présentez-vous au comptoir pour régler : votre commande partira en cuisine dès le paiement."
          : "Réglez au comptoir. Nous appellerons votre numéro dès que votre commande sera prête."}
      </p>
      <p className="text-lg opacity-90">
        {SERVICE_MODE[order.service_mode]} ·{" "}
        {formatMoney(order.total, order.currency)}
      </p>
      <Button
        ref={buttonRef}
        size="lg"
        variant="secondary"
        className="h-16 px-10 text-xl"
        onClick={() => done.current()}
      >
        Nouvelle commande
      </Button>
      <p className="text-sm opacity-80" aria-live="off">
        Retour au menu dans {left} s
      </p>
    </div>
  );
}
