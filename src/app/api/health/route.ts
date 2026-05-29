// src/app/api/health/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();

  try {
    // Vérifier la DB
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "1.0.0",
      uptime: process.uptime(),
      db: { status: "ok", latencyMs: dbLatency },
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        db: { status: "error", error: e instanceof Error ? e.message : "unknown" },
      },
      { status: 503 }
    );
  }
}
