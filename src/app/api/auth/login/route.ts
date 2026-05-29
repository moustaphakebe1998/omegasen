// src/app/api/auth/login/route.ts

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { ok, err, parseBody, auditLog } from "@/lib/api";
import { signToken, setAuthCookie } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/validations";
import { prisma } from "@/db/client";

export async function POST(req: NextRequest) {
  // Rate limiting
  const { blocked, retryAfter } = await checkLoginRateLimit(req);
  if (blocked) {
    return err(
      `Trop de tentatives. Réessayez dans ${retryAfter}s`,
      429,
      "TOO_MANY_REQUESTS"
    );
  }

  // Validation
  const parsed = await parseBody(req, loginSchema);
  if ("error" in parsed) return parsed.error;
  const { email, password } = parsed.data;

  // Chercher l'utilisateur
  const user = await prisma.user.findUnique({
    where: { email, deletedAt: null },
    include: {
      restaurants: { select: { restaurantId: true } },
    },
  });

  // Protection timing-attack : comparer même si user inexistant
  const hash = user?.passwordHash ?? "$2b$12$invalidhashfortimingprotection";
  const isValid = await bcrypt.compare(password, hash);

  if (!user || !isValid) {
    // Incrémenter le compteur de tentatives
    if (user) {
      const attempts = user.loginAttempts + 1;
      const lockedUntil = attempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000)
        : null;

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: attempts, lockedUntil },
      });
    }

    await auditLog({
      action: "USER_LOGIN",
      req,
      after: { email, success: false },
    });

    return err("Email ou mot de passe incorrect", 401, "INVALID_CREDENTIALS");
  }

  // Vérifier si verrouillé
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const wait = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return err(
      `Compte temporairement verrouillé. Réessayez dans ${wait} min`,
      423,
      "ACCOUNT_LOCKED"
    );
  }

  if (!user.isActive) {
    return err("Compte désactivé", 403, "ACCOUNT_DISABLED");
  }

  // Réinitialiser les tentatives et mettre à jour le lastLogin
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  // Générer le token
  const restaurantIds = user.restaurants.map((r) => r.restaurantId);
  const token = await signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    restaurants: restaurantIds,
  });

  await setAuthCookie(token);

  await auditLog({
    action: "USER_LOGIN",
    actorId: user.id,
    req,
    after: { email, success: true },
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    redirectTo: getRedirectUrl(user.role),
  });
}

function getRedirectUrl(role: string): string {
  switch (role) {
    case "CEO": return "/admin";
    case "MANAGER": return "/manager";
    case "KITCHEN": return "/kitchen";
    case "KIOSK": return "/kiosk";
    default: return "/";
  }
}
