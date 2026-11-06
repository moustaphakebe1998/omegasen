import type { Schemas } from "@/lib/api/client";

export type OrderStatus = Schemas["OrderStatus"];
export type OrderChannel = Schemas["OrderChannel"];
export type ServiceMode = Schemas["ServiceMode"];
export type PaymentStatus = Schemas["PaymentStatus"];
export type MemberRole = Schemas["MemberRole"];
export type PaymentMethod = Schemas["PaymentMethod"];

export const ORDER_STATUS: Record<OrderStatus, { label: string; className: string }> = {
  NEW: { label: "Nouvelle", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  PREPARING: {
    label: "En préparation",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  READY: { label: "Prête", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  COMPLETED: {
    label: "Terminée",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
  CANCELLED: { label: "Annulée", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
};

export const CHANNEL: Record<OrderChannel, string> = {
  QR: "QR Code",
  POS: "Guichet",
  ONLINE: "En ligne",
  KIOSK: "Borne",
};

export const SERVICE_MODE: Record<ServiceMode, string> = {
  DINE_IN: "Sur place",
  TAKEAWAY: "À emporter",
  DELIVERY: "Livraison",
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; className: string }> = {
  UNPAID: { label: "Non payée", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200" },
  PARTIALLY_PAID: {
    label: "Partiellement payée",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  },
  PAID: { label: "Payée", className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-200" },
  REFUNDED: {
    label: "Remboursée",
    className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  CARD: "Carte bancaire",
  ONLINE: "En ligne",
  MOBILE_MONEY: "Mobile Money",
  OTHER: "Autre",
};

/** Rôles d'un restaurant, du plus élevé au plus bas (hiérarchie : app/core/access.py côté serveur). */
export const ROLE: Record<MemberRole, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  MANAGER: "Responsable",
  CASHIER: "Caisse",
  WAITER: "Service en salle",
  KITCHEN: "Cuisine",
  STAFF: "Personnel",
};
