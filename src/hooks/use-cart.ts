// src/hooks/use-cart.ts — État panier client (Zustand)

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem } from "@/types";
import { nanoid } from "nanoid";

interface CartStore {
  restaurantId: string | null;
  items: CartItem[];
  idempotencyKey: string;

  // Actions
  setRestaurant: (restaurantId: string) => void;
  addItem: (item: Omit<CartItem, "cartId">) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clearCart: () => void;
  resetIdempotencyKey: () => void;

  // Computed
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      restaurantId: null,
      items: [],
      idempotencyKey: nanoid(),

      setRestaurant: (restaurantId) =>
        set((state) => {
          // Si changement de restaurant, vider le panier
          if (state.restaurantId && state.restaurantId !== restaurantId) {
            return {
              restaurantId,
              items: [],
              idempotencyKey: nanoid(),
            };
          }
          return { restaurantId };
        }),

      addItem: (item) =>
        set((state) => {
          // Vérifier si même produit + mêmes options existe déjà
          const existingIndex = state.items.findIndex(
            (existing) =>
              existing.productId === item.productId &&
              JSON.stringify(
                existing.selectedOptions.map((o) => o.optionId).sort()
              ) ===
                JSON.stringify(
                  item.selectedOptions.map((o) => o.optionId).sort()
                )
          );

          if (existingIndex >= 0) {
            const updated = [...state.items];
            updated[existingIndex] = {
              ...updated[existingIndex],
              quantity: updated[existingIndex].quantity + item.quantity,
            };
            return { items: updated };
          }

          return { items: [...state.items, item] };
        }),

      removeItem: (index) =>
        set((state) => ({
          items: state.items.filter((_, i) => i !== index),
        })),

      updateQuantity: (index, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((_, i) => i !== index) };
          }
          const updated = [...state.items];
          updated[index] = { ...updated[index], quantity };
          return { items: updated };
        }),

      clearCart: () =>
        set({ items: [], idempotencyKey: nanoid() }),

      resetIdempotencyKey: () =>
        set({ idempotencyKey: nanoid() }),

      getTotal: () => {
        const { items } = get();
        return items.reduce((total, item) => {
          const optionsTotal = item.selectedOptions.reduce(
            (acc, opt) => acc + opt.priceModifier,
            0
          );
          return total + (item.unitPrice + optionsTotal) * item.quantity;
        }, 0);
      },

      getItemCount: () => {
        const { items } = get();
        return items.reduce((count, item) => count + item.quantity, 0);
      },
    }),
    {
      name: "omegasen-cart",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
