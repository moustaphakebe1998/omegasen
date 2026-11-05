"use client";

import { ChevronRight, Receipt } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatTime } from "@/lib/format";

import { readRecentOrders, type RecentOrder } from "./recent-orders-store";

/** « Vos commandes récentes » : liens de suivi mémorisés sur cet appareil. */
export function RecentOrders() {
  const [orders, setOrders] = useState<RecentOrder[]>([]);

  useEffect(() => {
    setOrders(readRecentOrders());
  }, []);

  if (orders.length === 0) return null;

  return (
    <section
      aria-labelledby="recent-orders-title"
      className="mx-auto w-full max-w-7xl px-4"
    >
      <h2 id="recent-orders-title" className="mb-3 text-lg font-semibold">
        Vos commandes récentes
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((o) => (
          <li key={o.token}>
            <Link
              href={`/track/${o.token}`}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Receipt className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  Commande n° {o.displayNumber} · {o.restaurantName}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Passée à {formatTime(o.createdAt)}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
