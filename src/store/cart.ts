import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface CartOption { groupId: string; optionId: string; name: string; price: number }
export interface CartItem {
  cartId: string; productId: string; name: string; unitPrice: number
  quantity: number; options: CartOption[]; gradient: string
}

interface CartStore {
  restaurantId: string | null; items: CartItem[]; key: string
  setRestaurant: (id: string) => void
  add: (item: Omit<CartItem, 'cartId'>) => void
  remove: (id: string) => void
  setQty: (id: string, qty: number) => void
  clear: () => void
  total: () => number
  count: () => number
  lineTotal: (item: CartItem) => number
}

export const useCart = create<CartStore>((set, get) => ({
  restaurantId: null, items: [], key: nanoid(),
  setRestaurant: (id) => set(s => s.restaurantId === id ? {} : { restaurantId: id, items: [], key: nanoid() }),
  add: (item) => set(s => {
    const k = item.productId + JSON.stringify(item.options.map(o => o.optionId).sort())
    const idx = s.items.findIndex(e => e.productId + JSON.stringify(e.options.map(o => o.optionId).sort()) === k)
    if (idx >= 0) {
      const items = [...s.items]; items[idx] = { ...items[idx], quantity: items[idx].quantity + item.quantity }; return { items }
    }
    return { items: [...s.items, { ...item, cartId: nanoid() }] }
  }),
  remove: (id) => set(s => ({ items: s.items.filter(i => i.cartId !== id) })),
  setQty: (id, qty) => set(s => {
    if (qty <= 0) return { items: s.items.filter(i => i.cartId !== id) }
    return { items: s.items.map(i => i.cartId === id ? { ...i, quantity: qty } : i) }
  }),
  clear: () => set({ items: [], key: nanoid() }),
  lineTotal: (item) => (item.unitPrice + item.options.reduce((s, o) => s + o.price, 0)) * item.quantity,
  total: () => { const { items, lineTotal } = get(); return items.reduce((t, i) => t + lineTotal(i), 0) },
  count: () => get().items.reduce((t, i) => t + i.quantity, 0),
}))
