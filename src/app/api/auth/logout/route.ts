// src/app/api/auth/logout/route.ts

import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { clearAuthCookie, getCurrentUser } from "@/lib/auth";
import { auditLog } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  if (user) {
    await auditLog({
      action: "USER_LOGOUT",
      actorId: user.id,
      req,
    });
  }

  await clearAuthCookie();
  return ok({ message: "Déconnecté" });
}
