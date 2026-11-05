// src/validations/index.ts — Schemas Zod complets Omegasen

import { z } from "zod";

// ── Auth ──────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Email invalide").toLowerCase().trim(),
  password: z.string().min(1, "Mot de passe requis"),
});

export const registerSchema = z.object({
  email: z.string().email("Email invalide").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Minimum 8 caractères")
    .regex(/[A-Z]/, "Au moins une majuscule")
    .regex(/[0-9]/, "Au moins un chiffre"),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  role: z.enum(["CEO", "MANAGER", "KITCHEN", "KIOSK"]),
  restaurantId: z.string().cuid().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

// ── Restaurant ───────────────────────────────

export const createRestaurantSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug invalide (minuscules, chiffres, tirets)")
    .trim(),
  address: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal("")),
  currency: z.string().length(3).default("EUR"),
  taxRate: z.number().min(0).max(1).default(0.2),
  timezone: z.string().default("Europe/Paris"),
});

export const updateRestaurantSchema = createRestaurantSchema.partial().omit({
  slug: true,
});

// ── Menu Category ────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80).trim(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .trim(),
  description: z.string().max(300).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isVisible: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

// ── Product ──────────────────────────────────

export const createProductSchema = z.object({
  categoryId: z.string().cuid(),
  name: z.string().min(1).max(120).trim(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).trim(),
  description: z.string().max(500).optional(),
  price: z.number().positive().multipleOf(0.01),
  taxRate: z.number().min(0).max(1).optional(),
  isAvailable: z.boolean().default(true),
  isVisible: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  stockTracked: z.boolean().default(false),
  stockQuantity: z.number().int().min(0).optional(),
  sortOrder: z.number().int().min(0).default(0),
  allergens: z.array(z.string()).default([]),
  preparationTime: z.number().int().min(0).max(120).optional(),
  promoPrice: z.number().positive().optional(),
  promoEndsAt: z.string().datetime().optional(),
});

export const updateProductSchema = createProductSchema.partial().omit({
  categoryId: true,
  slug: true,
});

export const createOptionGroupSchema = z.object({
  productId: z.string().cuid(),
  name: z.string().min(1).max(80).trim(),
  isRequired: z.boolean().default(false),
  minChoices: z.number().int().min(0).default(0),
  maxChoices: z.number().int().min(1).default(1),
  sortOrder: z.number().int().min(0).default(0),
  options: z.array(
    z.object({
      name: z.string().min(1).max(80).trim(),
      priceModifier: z.number().multipleOf(0.01).default(0),
      isDefault: z.boolean().default(false),
      isAvailable: z.boolean().default(true),
      sortOrder: z.number().int().min(0).default(0),
    })
  ),
});

// ── Order ────────────────────────────────────

export const cartItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(200).optional(),
  selectedOptions: z
    .array(
      z.object({
        groupId: z.string().cuid(),
        optionId: z.string().cuid(),
      })
    )
    .default([]),
});

export const createOrderSchema = z.object({
  restaurantId: z.string().cuid(),
  items: z.array(cartItemSchema).min(1).max(50),
  notes: z.string().max(500).optional(),
  tableNumber: z.string().max(20).optional(),
  customerName: z.string().max(60).optional(),
  isTakeaway: z.boolean().default(false),
  kioskId: z.string().cuid().optional(),
  promoCode: z.string().max(20).optional(),
  idempotencyKey: z.string().uuid(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY",
    "SERVED",
    "CANCELLED",
    "ARCHIVED",
  ]),
  reason: z.string().max(200).optional(),
  isRollback: z.boolean().default(false),
});

// ── Kiosk ────────────────────────────────────

export const createKioskSchema = z.object({
  restaurantId: z.string().cuid(),
  name: z.string().min(1).max(60).trim(),
});

// ── Pagination ───────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ── Analytics ────────────────────────────────

export const analyticsQuerySchema = z.object({
  restaurantId: z.string().cuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

// ── Settings ─────────────────────────────────

export const updateSettingsSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().optional(),
});
