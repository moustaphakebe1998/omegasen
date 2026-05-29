// src/app/api/orders/route.ts

import { NextRequest } from "next/server";
import { withAuth, ok, err, parseBody, parseSearchParams, checkIdempotency } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { createOrderSchema, paginationSchema, updateOrderStatusSchema } from "@/validations";
import { prisma } from "@/db/client";
import { broadcast } from "@/lib/sse";
import { auditLog } from "@/lib/api";
import { generateOrderNumber, calculateOrderTotals } from "@/server/orders";
import { assertCanAccessRestaurant } from "@/lib/auth";
import { z } from "zod";

// ── GET /api/orders ───────────────────────────

export const GET = withAuth(async (req, { user, params: _ }) => {
  const querySchema = paginationSchema.extend({
    restaurantId: z.string().cuid(),
    status: z.string().optional(),
  });

  const parsed = parseSearchParams(req, querySchema);
  if ("error" in parsed) return parsed.error;
  const { restaurantId, status, page, pageSize, search } = parsed.data;

  assertCanAccessRestaurant(user, restaurantId);

  const where = {
    restaurantId,
    deletedAt: null,
    ...(status ? { status: status as never } : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search, mode: "insensitive" as const } },
            { customerName: { contains: search, mode: "insensitive" as const } },
            { tableNumber: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        items: { include: { options: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    items: orders,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
});

// ── POST /api/orders ──────────────────────────

export const POST = withAuth(async (req, { user }) => {
  // Rate limiting spécifique commandes
  const limited = await rateLimit(req, "order");
  if (!limited.success) {
    return err("Trop de commandes. Attendez un moment.", 429);
  }

  const parsed = await parseBody(req, createOrderSchema);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;

  assertCanAccessRestaurant(user, input.restaurantId);

  // Anti double-soumission
  const existing = await checkIdempotency(input.idempotencyKey);
  if (existing) {
    return ok({ order: existing, alreadyExists: true });
  }

  // Vérifier que le restaurant n'est pas en maintenance
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: input.restaurantId, isActive: true },
  });
  if (!restaurant) return err("Restaurant non disponible", 404);
  if (restaurant.maintenanceMode) {
    return err("Le restaurant est temporairement fermé", 503);
  }

  // Calcul des totaux côté serveur (jamais faire confiance au client)
  let totals;
  try {
    totals = await calculateOrderTotals(input.restaurantId, input.items);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Produit indisponible";
    return err(msg, 400, "PRODUCT_UNAVAILABLE");
  }

  const orderNumber = await generateOrderNumber(input.restaurantId);

  // Créer la commande en transaction
  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        restaurantId: input.restaurantId,
        createdById: user.id,
        kioskId: input.kioskId,
        status: "PENDING",
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: 0,
        total: totals.total,
        notes: input.notes,
        tableNumber: input.tableNumber,
        customerName: input.customerName,
        isTakeaway: input.isTakeaway ?? false,
        idempotencyKey: input.idempotencyKey,
        confirmedAt: null,
        items: {
          create: totals.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
            options: {
              create: item.selectedOptions.map((opt) => ({
                optionId: opt.optionId,
                optionName: opt.optionName,
                priceModifier: opt.priceModifier,
              })),
            },
          })),
        },
      },
      include: {
        items: { include: { options: true } },
      },
    });

    // Historique
    await tx.orderStatusHistory.create({
      data: {
        orderId: newOrder.id,
        fromStatus: null,
        toStatus: "PENDING",
        changedById: user.id,
      },
    });

    return newOrder;
  });

  // SSE broadcast
  broadcast(input.restaurantId, "order:new", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: order.total.toString(),
    itemCount: order.items.length,
  });

  await auditLog({
    action: "ORDER_CREATED",
    actorId: user.id,
    restaurantId: input.restaurantId,
    entity: "Order",
    entityId: order.id,
    after: { orderNumber, total: totals.total.toString() },
    req,
  });

  return ok({ order }, 201);
});
