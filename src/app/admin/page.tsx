// src/app/admin/page.tsx — Dashboard CEO

import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/db/client";
import { AdminDashboardClient } from "@/components/admin/dashboard-client";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CEO") redirect("/login");

  // Données initiales serveur
  const [restaurants, userCount, orderCount] = await Promise.all([
    prisma.restaurant.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.count({ where: { deletedAt: null, isActive: true } }),
    prisma.order.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return (
    <Suspense fallback={<AdminSkeleton />}>
      <AdminDashboardClient
        user={user}
        restaurants={restaurants}
        userCount={userCount}
        orderCount24h={orderCount}
      />
    </Suspense>
  );
}

function AdminSkeleton() {
  return (
    <div className="p-8 space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-gray-200 rounded-lg" />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-2xl" />
        ))}
      </div>
      <div className="h-72 bg-gray-200 rounded-2xl" />
    </div>
  );
}
