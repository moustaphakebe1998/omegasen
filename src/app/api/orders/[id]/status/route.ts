// src/app/api/orders/[id]/status/route.ts

import { NextRequest } from "next/server";
import { withAuth, ok, err, parseBody } from "@/lib/api";
import { updateOrderStatusSchema } from "@/validations";
import { updateOrderStatus, canTransition } from "@/server/orders";
import { assertCanAccessRestaurant } from "@/lib/auth";
import { prisma } from "@/db/client";
import type { OrderStatus } from "@prisma/client";

export const PATCH = withAuth(async (req, { user, params }) => {
  const { id } = params;

  const parsed = await parseBody(req, updateOrderStatusSchema);
  if ("error" in parsed) return parsed.error;
  const { status, reason } = parsed.data;

  // Vérifier que la commande existe et appartient à un restaurant autorisé
  const order = await prisma.order.findFirst({
    where: { id, deletedAt: null },
    select: { restaurantId: true, status: true },
  });

  if (!order) return err("Commande introuvable", 404);
  assertCanAccessRestaurant(user, order.restaurantId);

  // Vérifier la transition
  if (!canTransition(order.status, status as OrderStatus, user.role)) {
    return err(
      `Transition ${order.status} → ${status} non autorisée pour votre rôle`,
      403,
      "TRANSITION_NOT_ALLOWED"
    );
  }

  try {
    const updated = await updateOrderStatus(
      id,
      order.restaurantId,
      status as OrderStatus,
      user.id,
      user.role,
      reason
    );
    return ok({ order: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur mise à jour";
    return err(msg, 400);
  }
});
