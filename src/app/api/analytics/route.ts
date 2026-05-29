// src/app/api/analytics/route.ts

import { NextRequest } from "next/server";
import { withAuth, ok, err, parseSearchParams } from "@/lib/api";
import { analyticsQuerySchema } from "@/validations";
import { prisma } from "@/db/client";
import { assertCanAccessRestaurant } from "@/lib/auth";

export const GET = withAuth(async (req, { user }) => {
  const parsed = parseSearchParams(req, analyticsQuerySchema);
  if ("error" in parsed) return parsed.error;
  const { restaurantId, from, to, granularity } = parsed.data;

  if (restaurantId) {
    assertCanAccessRestaurant(user, restaurantId);
  } else if (user.role !== "CEO") {
    return err("restaurantId requis", 400);
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  const restaurantFilter = restaurantId
    ? { restaurantId }
    : user.role === "CEO"
    ? {}
    : { restaurantId: { in: user.restaurants } };

  // KPIs principaux
  const [currentPeriod, prevPeriod] = await Promise.all([
    getRevenueStats(fromDate, toDate, restaurantFilter),
    getRevenueStats(
      new Date(fromDate.getTime() - (toDate.getTime() - fromDate.getTime())),
      fromDate,
      restaurantFilter
    ),
  ]);

  // Évolution temporelle
  const revenueTimeline = await getRevenueTimeline(
    fromDate,
    toDate,
    restaurantFilter,
    granularity
  );

  // Top produits
  const topProducts = await getTopProducts(fromDate, toDate, restaurantFilter);

  // Performance par restaurant (CEO seulement)
  const restaurantStats =
    user.role === "CEO"
      ? await getRestaurantPerformance(fromDate, toDate)
      : null;

  const revenueChange =
    prevPeriod.revenue > 0
      ? ((currentPeriod.revenue - prevPeriod.revenue) / prevPeriod.revenue) * 100
      : 0;

  const orderCountChange =
    prevPeriod.orderCount > 0
      ? ((currentPeriod.orderCount - prevPeriod.orderCount) / prevPeriod.orderCount) * 100
      : 0;

  return ok({
    kpis: {
      revenue: currentPeriod.revenue,
      revenueChange: Math.round(revenueChange * 10) / 10,
      orderCount: currentPeriod.orderCount,
      orderCountChange: Math.round(orderCountChange * 10) / 10,
      averageBasket:
        currentPeriod.orderCount > 0
          ? currentPeriod.revenue / currentPeriod.orderCount
          : 0,
      cancellationRate: currentPeriod.cancellationRate,
      avgPrepTime: currentPeriod.avgPrepTime,
    },
    revenueTimeline,
    topProducts,
    restaurantStats,
  });
});

async function getRevenueStats(
  from: Date,
  to: Date,
  restaurantFilter: object
) {
  const [orders, cancelled, prepTimes] = await Promise.all([
    prisma.order.aggregate({
      where: {
        ...restaurantFilter,
        status: { in: ["SERVED", "READY"] },
        createdAt: { gte: from, lte: to },
      },
      _sum: { total: true },
      _count: { id: true },
    }),
    prisma.order.count({
      where: {
        ...restaurantFilter,
        status: "CANCELLED",
        createdAt: { gte: from, lte: to },
      },
    }),
    prisma.order.findMany({
      where: {
        ...restaurantFilter,
        status: { in: ["SERVED", "READY"] },
        createdAt: { gte: from, lte: to },
        preparingAt: { not: null },
        readyAt: { not: null },
      },
      select: { preparingAt: true, readyAt: true },
    }),
  ]);

  const totalOrders = orders._count.id + cancelled;
  const cancellationRate =
    totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0;

  const avgPrepTime =
    prepTimes.length > 0
      ? prepTimes.reduce(
          (acc, o) =>
            acc +
            (o.readyAt!.getTime() - o.preparingAt!.getTime()) / 60_000,
          0
        ) / prepTimes.length
      : 0;

  return {
    revenue: Number(orders._sum.total ?? 0),
    orderCount: orders._count.id,
    cancellationRate: Math.round(cancellationRate * 10) / 10,
    avgPrepTime: Math.round(avgPrepTime),
  };
}

async function getRevenueTimeline(
  from: Date,
  to: Date,
  restaurantFilter: object,
  granularity: string
) {
  const orders = await prisma.order.findMany({
    where: {
      ...restaurantFilter,
      status: { in: ["SERVED", "READY"] },
      createdAt: { gte: from, lte: to },
    },
    select: { createdAt: true, total: true },
  });

  // Grouper par jour/semaine/mois
  const grouped = new Map<string, { revenue: number; orders: number }>();

  for (const order of orders) {
    let key: string;
    const d = order.createdAt;
    if (granularity === "month") {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    } else if (granularity === "week") {
      const week = getISOWeek(d);
      key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    } else {
      key = d.toISOString().slice(0, 10);
    }

    const existing = grouped.get(key) ?? { revenue: 0, orders: 0 };
    grouped.set(key, {
      revenue: existing.revenue + Number(order.total),
      orders: existing.orders + 1,
    });
  }

  return Array.from(grouped.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function getTopProducts(from: Date, to: Date, restaurantFilter: object) {
  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        ...restaurantFilter,
        status: { in: ["SERVED", "READY"] },
        createdAt: { gte: from, lte: to },
      },
    },
    select: {
      productId: true,
      productName: true,
      quantity: true,
      subtotal: true,
    },
  });

  const map = new Map<
    string,
    { productName: string; totalSold: number; revenue: number }
  >();

  for (const item of items) {
    const existing = map.get(item.productId) ?? {
      productName: item.productName,
      totalSold: 0,
      revenue: 0,
    };
    map.set(item.productId, {
      productName: item.productName,
      totalSold: existing.totalSold + item.quantity,
      revenue: existing.revenue + Number(item.subtotal),
    });
  }

  return Array.from(map.entries())
    .map(([productId, data]) => ({ productId, ...data }))
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, 10);
}

async function getRestaurantPerformance(from: Date, to: Date) {
  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });

  return await Promise.all(
    restaurants.map(async (r) => {
      const stats = await getRevenueStats(from, to, {
        restaurantId: r.id,
      });
      return { restaurantId: r.id, name: r.name, ...stats };
    })
  );
}

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 -
      3 +
      ((week1.getDay() + 6) % 7)) /
      7
  );
}
