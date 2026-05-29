// src/server/orders.ts — Logique métier commandes

import { prisma } from "@/db/client";
import { broadcast } from "@/lib/sse";
import { auditLog } from "@/lib/api";
import type { OrderStatus } from "@prisma/client";
import type { OrderWithItems } from "@/types";
import { Decimal } from "@prisma/client/runtime/library";

// ── Numéro de commande ────────────────────────

export async function generateOrderNumber(restaurantId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.order.count({
    where: {
      restaurantId,
      createdAt: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    },
  });
  const seq = String(count + 1).padStart(3, "0");
  return `${today}-${seq}`;
}

// ── Calcul des totaux (SERVEUR UNIQUEMENT) ────

export async function calculateOrderTotals(
  restaurantId: string,
  items: {
    productId: string;
    quantity: number;
    selectedOptions: { groupId: string; optionId: string }[];
  }[]
) {
  // Récupérer le restaurant pour le taux de taxe
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { taxRate: true },
  });

  let subtotal = new Decimal(0);

  const computedItems = await Promise.all(
    items.map(async (item) => {
      const product = await prisma.product.findFirstOrThrow({
        where: {
          id: item.productId,
          deletedAt: null,
          isAvailable: true,
          category: { restaurantId },
        },
        include: {
          optionGroups: {
            include: { options: true },
          },
        },
      });

      // Prix effectif (promo si active)
      let unitPrice = product.promoPrice
        ? product.promoPrice
        : product.price;

      // Valider et additionner les options
      const selectedOptions: {
        optionId: string;
        optionName: string;
        priceModifier: Decimal;
      }[] = [];

      for (const sel of item.selectedOptions) {
        const group = product.optionGroups.find((g) => g.id === sel.groupId);
        if (!group) throw new Error(`Groupe option inconnu: ${sel.groupId}`);

        const option = group.options.find(
          (o) => o.id === sel.optionId && o.isAvailable
        );
        if (!option) throw new Error(`Option inconnue: ${sel.optionId}`);

        unitPrice = unitPrice.add(option.priceModifier);
        selectedOptions.push({
          optionId: option.id,
          optionName: option.name,
          priceModifier: option.priceModifier,
        });
      }

      const itemSubtotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(itemSubtotal);

      return {
        productId: product.id,
        productName: product.name,
        unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
        selectedOptions,
      };
    })
  );

  const taxAmount = subtotal.mul(restaurant.taxRate);
  const total = subtotal.add(taxAmount);

  return {
    items: computedItems,
    subtotal,
    taxAmount,
    total,
    taxRate: restaurant.taxRate,
  };
}

// ── Transitions de statut autorisées ─────────

type StatusTransition = {
  from: OrderStatus[];
  to: OrderStatus;
  roles: string[];
  isRollback?: boolean;
};

const ALLOWED_TRANSITIONS: StatusTransition[] = [
  { from: ["DRAFT"], to: "PENDING", roles: ["CEO", "MANAGER", "KIOSK"] },
  { from: ["PENDING"], to: "CONFIRMED", roles: ["CEO", "MANAGER"] },
  { from: ["CONFIRMED"], to: "PREPARING", roles: ["CEO", "MANAGER", "KITCHEN"] },
  { from: ["PREPARING"], to: "READY", roles: ["CEO", "MANAGER", "KITCHEN"] },
  { from: ["READY"], to: "SERVED", roles: ["CEO", "MANAGER", "KITCHEN"] },
  // Retours arrière contrôlés
  {
    from: ["PREPARING"],
    to: "CONFIRMED",
    roles: ["CEO", "MANAGER", "KITCHEN"],
    isRollback: true,
  },
  {
    from: ["READY"],
    to: "PREPARING",
    roles: ["CEO", "MANAGER", "KITCHEN"],
    isRollback: true,
  },
  {
    from: ["SERVED"],
    to: "READY",
    roles: ["CEO", "MANAGER"],
    isRollback: true,
  },
  // Annulation
  {
    from: ["DRAFT", "PENDING", "CONFIRMED"],
    to: "CANCELLED",
    roles: ["CEO", "MANAGER"],
  },
  // Archivage
  {
    from: ["SERVED", "CANCELLED"],
    to: "ARCHIVED",
    roles: ["CEO", "MANAGER"],
  },
];

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  role: string
): boolean {
  return ALLOWED_TRANSITIONS.some(
    (t) =>
      t.from.includes(from) &&
      t.to === to &&
      t.roles.includes(role)
  );
}

// ── Mise à jour statut ────────────────────────

export async function updateOrderStatus(
  orderId: string,
  restaurantId: string,
  newStatus: OrderStatus,
  actorId: string,
  actorRole: string,
  reason?: string
) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, restaurantId, deletedAt: null },
  });

  if (!canTransition(order.status, newStatus, actorRole)) {
    throw new Error(`Transition ${order.status} → ${newStatus} non autorisée`);
  }

  const isRollback = ALLOWED_TRANSITIONS.find(
    (t) =>
      t.from.includes(order.status) &&
      t.to === newStatus &&
      t.isRollback === true
  );

  const timestamps: Partial<Record<string, Date | null>> = {};
  const now = new Date();

  if (newStatus === "CONFIRMED") timestamps.confirmedAt = now;
  if (newStatus === "PREPARING") timestamps.preparingAt = isRollback ? null : now;
  if (newStatus === "READY") timestamps.readyAt = isRollback ? null : now;
  if (newStatus === "SERVED") timestamps.servedAt = isRollback ? null : now;
  if (newStatus === "CANCELLED") {
    timestamps.cancelledAt = now;
    timestamps.cancelReason = reason ?? null;
  }

  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        ...timestamps,
      },
      include: {
        items: { include: { options: true } },
        payments: true,
      },
    }),
    prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: newStatus,
        changedById: actorId,
        reason,
        isRollback: !!isRollback,
      },
    }),
  ]);

  // Broadcast SSE
  broadcast(restaurantId, "order:update", {
    orderId,
    orderNumber: order.orderNumber,
    oldStatus: order.status,
    newStatus,
    isRollback: !!isRollback,
  });

  // Audit log
  await auditLog({
    action: "ORDER_STATUS_CHANGED",
    actorId,
    restaurantId,
    entity: "Order",
    entityId: orderId,
    before: { status: order.status },
    after: { status: newStatus, isRollback: !!isRollback },
  });

  return updatedOrder;
}

// ── Kitchen orders ────────────────────────────

export async function getKitchenOrders(restaurantId: string) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: ["CONFIRMED", "PREPARING", "READY"] },
      deletedAt: null,
    },
    include: {
      items: {
        include: { options: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    tableNumber: order.tableNumber,
    customerName: order.customerName,
    isTakeaway: order.isTakeaway,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    preparingAt: order.preparingAt,
    readyAt: order.readyAt,
    elapsedMinutes: Math.floor(
      (Date.now() - order.createdAt.getTime()) / 60_000
    ),
    isUrgent: Date.now() - order.createdAt.getTime() > 15 * 60_000,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      notes: item.notes,
      options: item.options.map((o) => o.optionName),
    })),
  }));
}
