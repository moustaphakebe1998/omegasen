// src/app/kiosk/[restaurantSlug]/page.tsx — Borne client

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Plus, Minus, ArrowLeft, CheckCircle2, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useCart } from "@/hooks/use-cart";
import type { CategoryWithProducts, ProductSummary } from "@/types";
import { nanoid } from "nanoid";

type Screen = "menu" | "product" | "cart" | "confirm" | "success";

export default function KioskPage({
  params,
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const [slug, setSlug] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [screen, setScreen] = useState<Screen>("menu");
  const [selectedProduct, setSelectedProduct] = useState<ProductSummary | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const cart = useCart();

  useEffect(() => {
    params.then((p) => {
      setSlug(p.restaurantSlug);
    });
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/kiosk/restaurant?slug=${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setRestaurantId(d.data.id);
          cart.setRestaurant(d.data.id);
        }
      });
  }, [slug]);

  useEffect(() => {
    if (!restaurantId) return;
    fetch(`/api/menu/public?restaurantId=${restaurantId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const cats = d.data.filter((c: CategoryWithProducts) =>
            c.isVisible && c.products.some((p) => p.isAvailable && p.isVisible)
          );
          setCategories(cats);
          if (cats.length > 0) setActiveCategory(cats[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, [restaurantId]);

  async function placeOrder() {
    if (cart.items.length === 0) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/orders/kiosk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          items: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes,
            selectedOptions: item.selectedOptions.map((o) => ({
              groupId: o.groupId,
              optionId: o.optionId,
            })),
          })),
          idempotencyKey: cart.idempotencyKey,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setOrderNumber(json.data.order.orderNumber);
        cart.clearCart();
        setScreen("success");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const currentCategory = categories.find((c) => c.id === activeCategory);
  const itemCount = cart.getItemCount();
  const total = cart.getTotal();

  if (loading) {
    return (
      <div className="kiosk-interface flex items-center justify-center">
        <Loader2 size={40} className="text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="kiosk-interface">
      <AnimatePresence mode="wait">
        {screen === "menu" && (
          <MenuScreen
            key="menu"
            categories={categories}
            activeCategory={activeCategory}
            currentCategory={currentCategory}
            onCategoryChange={setActiveCategory}
            onProductClick={(p) => {
              setSelectedProduct(p);
              setScreen("product");
            }}
            onCartClick={() => setScreen("cart")}
            itemCount={itemCount}
            total={total}
          />
        )}

        {screen === "product" && selectedProduct && (
          <ProductScreen
            key="product"
            product={selectedProduct}
            onBack={() => setScreen("menu")}
            onAdd={(item) => {
              cart.addItem(item);
              setScreen("menu");
            }}
          />
        )}

        {screen === "cart" && (
          <CartScreen
            key="cart"
            items={cart.items}
            total={total}
            onBack={() => setScreen("menu")}
            onRemove={cart.removeItem}
            onUpdateQty={cart.updateQuantity}
            onConfirm={() => setScreen("confirm")}
          />
        )}

        {screen === "confirm" && (
          <ConfirmScreen
            key="confirm"
            items={cart.items}
            total={total}
            onBack={() => setScreen("cart")}
            onPlace={placeOrder}
            submitting={submitting}
          />
        )}

        {screen === "success" && (
          <SuccessScreen
            key="success"
            orderNumber={orderNumber}
            onNewOrder={() => setScreen("menu")}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Écran Menu ────────────────────────────────

function MenuScreen({
  categories,
  activeCategory,
  currentCategory,
  onCategoryChange,
  onProductClick,
  onCartClick,
  itemCount,
  total,
}: {
  categories: CategoryWithProducts[];
  activeCategory: string;
  currentCategory: CategoryWithProducts | undefined;
  onCategoryChange: (id: string) => void;
  onProductClick: (p: ProductSummary) => void;
  onCartClick: () => void;
  itemCount: number;
  total: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-screen"
    >
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 pt-8 pb-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Notre carte</h1>
            <p className="text-gray-500 text-sm mt-0.5">Tapez pour commander</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-xl">O</span>
          </div>
        </div>

        {/* Catégories */}
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-6 px-6">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`shrink-0 h-11 px-5 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat.id
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      {/* Grille produits */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-4">
          {currentCategory?.products
            .filter((p) => p.isAvailable && p.isVisible)
            .map((product, i) => (
              <motion.button
                key={product.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => onProductClick(product)}
                className="bg-white rounded-2xl overflow-hidden border border-gray-100 text-left hover:border-orange-200 hover:shadow-md transition-all active:scale-[0.98]"
              >
                {/* Image */}
                <div className="aspect-[4/3] bg-gray-100 relative">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                  )}
                  {product.promoPrice && (
                    <div className="absolute top-2 left-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      Promo
                    </div>
                  )}
                  {product.isFeatured && !product.promoPrice && (
                    <div className="absolute top-2 left-2 bg-gray-900 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      ✨ Favori
                    </div>
                  )}
                </div>

                {/* Infos */}
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 text-base leading-tight truncate">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="text-gray-500 text-xs mt-1 line-clamp-2">
                      {product.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div>
                      {product.promoPrice ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-orange-500 font-bold text-lg">
                            {formatPrice(Number(product.promoPrice))}
                          </span>
                          <span className="text-gray-400 text-sm line-through">
                            {formatPrice(Number(product.price))}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-900 font-bold text-lg">
                          {formatPrice(Number(product.price))}
                        </span>
                      )}
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
                      <Plus size={18} className="text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
        </div>
      </main>

      {/* Panier flottant */}
      {itemCount > 0 && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          className="px-6 pb-8 pt-2 bg-gradient-to-t from-[#F8F7F5] via-[#F8F7F5]"
        >
          <button
            onClick={onCartClick}
            className="kiosk-btn w-full bg-gray-900 text-white flex items-center justify-between px-6"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-sm font-bold tabular-nums">
                {itemCount}
              </span>
              <span>Voir mon panier</span>
            </div>
            <span className="font-bold text-lg">{formatPrice(total)}</span>
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Écran Produit ─────────────────────────────

function ProductScreen({
  product,
  onBack,
  onAdd,
}: {
  product: ProductSummary;
  onBack: () => void;
  onAdd: (item: Parameters<ReturnType<typeof useCart>["addItem"]>[0]) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, { optionId: string; optionName: string; priceModifier: number }>
  >({});
  const [notes, setNotes] = useState("");

  const optionTotal = Object.values(selectedOptions).reduce(
    (acc, o) => acc + o.priceModifier,
    0
  );
  const unitPrice = product.promoPrice
    ? Number(product.promoPrice)
    : Number(product.price);
  const totalPrice = (unitPrice + optionTotal) * quantity;

  function toggleOption(groupId: string, optionId: string, optionName: string, priceModifier: number, maxChoices: number) {
    setSelectedOptions((prev) => {
      if (maxChoices === 1) {
        return { ...prev, [`${groupId}:${optionId}`]: { optionId, optionName, priceModifier } };
      }
      const key = `${groupId}:${optionId}`;
      const updated = { ...prev };
      if (updated[key]) {
        delete updated[key];
      } else {
        updated[key] = { optionId, optionName, priceModifier };
      }
      return updated;
    });
  }

  function handleAdd() {
    onAdd({
      productId: product.id,
      productName: product.name,
      unitPrice: unitPrice + optionTotal,
      quantity,
      notes: notes || undefined,
      selectedOptions: Object.entries(selectedOptions).map(([key, val]) => ({
        groupId: key.split(":")[0],
        optionId: val.optionId,
        optionName: val.optionName,
        priceModifier: val.priceModifier,
      })),
    });
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="flex flex-col h-screen bg-white"
    >
      {/* Image */}
      <div className="relative h-64 bg-gray-100 shrink-0">
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt={product.name} fill className="object-cover" sizes="100vw" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-8xl">🍽️</div>
        )}
        <button
          onClick={onBack}
          className="absolute top-4 left-4 w-11 h-11 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{product.name}</h2>
        {product.description && (
          <p className="text-gray-500 text-base mt-2 leading-relaxed">{product.description}</p>
        )}
        <div className="mt-2">
          <span className="text-2xl font-bold text-gray-900">{formatPrice(unitPrice)}</span>
          {product.preparationTime && (
            <span className="text-gray-400 text-sm ml-3">~{product.preparationTime} min</span>
          )}
        </div>

        {/* Options */}
        {product.optionGroups.map((group) => (
          <div key={group.id} className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-bold text-gray-800 text-base">{group.name}</h3>
              {group.isRequired && (
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                  Obligatoire
                </span>
              )}
            </div>
            <div className="space-y-2">
              {group.options.filter((o) => o.isAvailable).map((option) => {
                const key = `${group.id}:${option.id}`;
                const isSelected = !!selectedOptions[key];
                return (
                  <button
                    key={option.id}
                    onClick={() => toggleOption(group.id, option.id, option.name, Number(option.priceModifier), group.maxChoices)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "border-gray-900 bg-gray-900" : "border-gray-300"}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <span className="text-gray-800 font-medium">{option.name}</span>
                    </div>
                    {Number(option.priceModifier) > 0 && (
                      <span className="text-gray-600 text-sm">+{formatPrice(Number(option.priceModifier))}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Notes */}
        <div className="mt-6">
          <label className="block font-bold text-gray-800 text-base mb-2">Instructions spéciales</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: sans oignons, allergie aux noix…"
            maxLength={200}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm resize-none focus:outline-none focus:border-orange-400"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 pt-4 bg-white border-t border-gray-100">
        {/* Quantité */}
        <div className="flex items-center justify-center gap-5 mb-4">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Minus size={18} className="text-gray-700" />
          </button>
          <span className="text-3xl font-bold text-gray-900 tabular-nums w-8 text-center">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            className="w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus size={18} className="text-gray-700" />
          </button>
        </div>
        <button
          onClick={handleAdd}
          className="kiosk-btn w-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-between px-6"
        >
          <span>Ajouter au panier</span>
          <span className="font-bold text-lg">{formatPrice(totalPrice)}</span>
        </button>
      </div>
    </motion.div>
  );
}

// ── Écran Panier ──────────────────────────────

function CartScreen({
  items,
  total,
  onBack,
  onRemove,
  onUpdateQty,
  onConfirm,
}: {
  items: ReturnType<typeof useCart>["items"];
  total: number;
  onBack: () => void;
  onRemove: (i: number) => void;
  onUpdateQty: (i: number, q: number) => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="flex flex-col h-screen bg-[#F8F7F5]"
    >
      <header className="bg-white px-6 py-5 flex items-center gap-4 border-b border-gray-100">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-gray-700" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">Mon panier</h2>
        <span className="ml-auto text-sm text-gray-500">{items.length} article{items.length > 1 ? "s" : ""}</span>
      </header>

      <main className="flex-1 overflow-y-auto p-5 space-y-3">
        {items.map((item, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{item.productName}</p>
              {item.selectedOptions.length > 0 && (
                <p className="text-gray-500 text-xs mt-0.5 truncate">
                  {item.selectedOptions.map((o) => o.optionName).join(", ")}
                </p>
              )}
              <p className="text-orange-500 font-bold text-base mt-1">
                {formatPrice(item.unitPrice * item.quantity)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onUpdateQty(i, item.quantity - 1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <Minus size={14} />
              </button>
              <span className="w-5 text-center font-bold tabular-nums">{item.quantity}</span>
              <button onClick={() => onUpdateQty(i, item.quantity + 1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <Plus size={14} />
              </button>
              <button onClick={() => onRemove(i)} className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center ml-1">
                <X size={14} className="text-red-500" />
              </button>
            </div>
          </div>
        ))}
      </main>

      <div className="px-6 pb-8 pt-4 bg-white border-t border-gray-100">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Sous-total</span>
          <span>{formatPrice(total)}</span>
        </div>
        <div className="flex justify-between font-bold text-xl text-gray-900 mb-5 pb-4 border-b border-gray-100">
          <span>Total</span>
          <span className="text-orange-500">{formatPrice(total)}</span>
        </div>
        <button onClick={onConfirm} className="kiosk-btn w-full bg-gray-900 text-white flex items-center justify-center gap-3">
          <ShoppingCart size={20} />
          Passer la commande
        </button>
      </div>
    </motion.div>
  );
}

// ── Écran Confirmation ────────────────────────

function ConfirmScreen({
  items,
  total,
  onBack,
  onPlace,
  submitting,
}: {
  items: ReturnType<typeof useCart>["items"];
  total: number;
  onBack: () => void;
  onPlace: () => void;
  submitting: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-screen bg-[#F8F7F5]"
    >
      <header className="bg-white px-6 py-5 flex items-center gap-4 border-b border-gray-100">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-bold text-gray-900">Confirmation</h2>
      </header>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="bg-white rounded-2xl p-5 mb-4">
          <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wider mb-4">Votre commande</h3>
          {items.map((item, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-gray-800">{item.quantity}× {item.productName}</span>
              <span className="font-semibold text-gray-900">{formatPrice(item.unitPrice * item.quantity)}</span>
            </div>
          ))}
          <div className="flex justify-between mt-4 pt-2 font-bold text-xl">
            <span>Total</span>
            <span className="text-orange-500">{formatPrice(total)}</span>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          ⚠ Vérifiez votre commande avant de confirmer. Aucune modification ne sera possible après validation.
        </div>
      </main>
      <div className="px-6 pb-8 pt-4 space-y-3 bg-white border-t border-gray-100">
        <button
          onClick={onPlace}
          disabled={submitting}
          className="kiosk-btn w-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center gap-3 disabled:opacity-60"
        >
          {submitting ? (
            <><Loader2 size={20} className="animate-spin" /> En cours…</>
          ) : (
            <>✓ Confirmer ma commande</>
          )}
        </button>
        <button onClick={onBack} className="kiosk-btn w-full bg-gray-100 text-gray-700 text-base font-medium">
          Modifier mon panier
        </button>
      </div>
    </motion.div>
  );
}

// ── Écran Succès ──────────────────────────────

function SuccessScreen({
  orderNumber,
  onNewOrder,
}: {
  orderNumber: string;
  onNewOrder: () => void;
}) {
  const shortNumber = orderNumber.slice(-3);

  useEffect(() => {
    const timer = setTimeout(onNewOrder, 30_000);
    return () => clearTimeout(timer);
  }, [onNewOrder]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-screen bg-white items-center justify-center p-8 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-8"
      >
        <CheckCircle2 size={48} className="text-green-600" />
      </motion.div>

      <h2 className="text-3xl font-bold text-gray-900 mb-2">Commande confirmée !</h2>
      <p className="text-gray-500 text-lg mb-8">Nous préparons votre commande.</p>

      <div className="bg-gray-900 text-white rounded-3xl px-12 py-8 mb-8 shadow-xl">
        <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Votre numéro</p>
        <p className="text-7xl font-black tabular-nums tracking-tighter">{shortNumber}</p>
      </div>

      <p className="text-gray-500 text-sm mb-10">
        Un signal sonore vous avertira lorsque votre commande sera prête.
      </p>

      <button
        onClick={onNewOrder}
        className="kiosk-btn px-10 bg-gray-100 text-gray-700 text-base font-medium"
      >
        Nouvelle commande
      </button>
    </motion.div>
  );
}

// ── Utils ─────────────────────────────────────

function formatPrice(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}
