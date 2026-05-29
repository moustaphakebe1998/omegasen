// src/app/api/menu/route.ts

import { NextRequest } from "next/server";
import { withAuth, ok, err, parseBody, parseSearchParams } from "@/lib/api";
import { createCategorySchema } from "@/validations";
import { prisma } from "@/db/client";
import { broadcast } from "@/lib/sse";
import { assertCanAccessRestaurant, hasPermission } from "@/lib/auth";
import { auditLog } from "@/lib/api";
import { z } from "zod";

// ── GET /api/menu?restaurantId=xxx ────────────

export const GET = withAuth(async (req, { user }) => {
  const { restaurantId } = Object.fromEntries(req.nextUrl.searchParams);

  if (!restaurantId) return err("restaurantId requis", 400);
  assertCanAccessRestaurant(user, restaurantId);

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId, deletedAt: null },
    include: {
      products: {
        where: { deletedAt: null },
        include: {
          optionGroups: {
            include: { options: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return ok(categories);
});

// ── POST /api/menu (créer catégorie) ──────────

export const POST = withAuth(async (req, { user }) => {
  if (!hasPermission(user, "menu:write")) {
    return err("Droits insuffisants", 403);
  }

  const body = await parseBody(req, createCategorySchema.extend({
    restaurantId: z.string().cuid(),
  }));
  if ("error" in body) return body.error;
  const { restaurantId, ...data } = body.data;

  assertCanAccessRestaurant(user, restaurantId);

  // Vérifier unicité du slug
  const existing = await prisma.menuCategory.findFirst({
    where: { restaurantId, slug: data.slug, deletedAt: null },
  });
  if (existing) {
    return err("Un slug identique existe déjà", 409, "SLUG_CONFLICT");
  }

  const category = await prisma.menuCategory.create({
    data: { restaurantId, ...data },
  });

  broadcast(restaurantId, "menu:update", {
    action: "category:created",
    categoryId: category.id,
  });

  await auditLog({
    action: "CATEGORY_CREATED",
    actorId: user.id,
    restaurantId,
    entity: "MenuCategory",
    entityId: category.id,
    after: data,
    req,
  });

  return ok(category, 201);
});
