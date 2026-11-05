'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useCart } from '@/hooks/use-cart'

type Screen = 'menu' | 'cart' | 'confirm' | 'success'

interface Product {
  id: string; name: string; description: string | null; price: number; imageUrl: string | null; isAvailable: boolean
  optionGroups: { id: string; name: string; isRequired: boolean; options: { id: string; name: string; priceModifier: number; isDefault: boolean }[] }[]
}
interface Category { id: string; name: string; products: Product[] }

function formatPrice(n: number) {
  return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n/100)
}

export default function KioskPage() {
  const { restaurantSlug } = useParams() as { restaurantSlug: string }
  const [screen, setScreen] = useState<Screen>('menu')
  const [categories, setCategories] = useState<Category[]>([])
  const [restaurant, setRestaurant] = useState<{id:string;name:string;logoUrl:string|null}|null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product|null>(null)
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(true)
  const [orderNumber, setOrderNumber] = useState('')
  const [placing, setPlacing] = useState(false)

  const cart = useCart()

  useEffect(()=>{
    async function load() {
      const res = await fetch(`/api/kiosk/restaurant?slug=${restaurantSlug}`)
      const d = await res.json()
      if(!d.data) return
      setRestaurant(d.data)
      cart.setRestaurant(d.data.id)
      const menuRes = await fetch(`/api/menu?restaurantId=${d.data.id}`)
      const menuData = await menuRes.json()
      if(menuData.data) setCategories(menuData.data)
      setLoading(false)
    }
    load()
  },[restaurantSlug])

  async function placeOrder() {
    if(!restaurant||cart.items.length===0) return
    setPlacing(true)
    try {
      const res = await fetch('/api/orders/kiosk',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          restaurantId: restaurant.id,
          idempotencyKey: cart.idempotencyKey,
          items: cart.items.map(i=>({
            productId: i.productId,
            quantity: i.quantity,
            notes: i.notes,
            selectedOptions: i.selectedOptions.map(o=>({groupId:o.groupId,optionId:o.optionId})),
          })),
        }),
      })
      const data = await res.json()
      if(data.data) {
        setOrderNumber(data.data.orderNumber)
        cart.clearCart()
        setScreen('success')
        setTimeout(()=>{ setScreen('menu'); setOrderNumber('') }, 30_000)
      }
    } finally { setPlacing(false) }
  }

  if(loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/></div>

  if(screen==='success') return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-8">
      <div className="text-6xl mb-6">✅</div>
      <h1 className="text-4xl font-black mb-2">Commande envoyée !</h1>
      <p className="text-gray-400 text-lg mb-8">Votre numéro de commande</p>
      <div className="text-6xl font-black font-mono text-orange-500 mb-12">{orderNumber}</div>
      <p className="text-gray-500 text-sm">Réinitialisation automatique dans 30 secondes</p>
      <button onClick={()=>{setScreen('menu');setOrderNumber('')}} className="mt-8 bg-orange-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-orange-600 transition-colors">
        Nouvelle commande
      </button>
    </div>
  )

  if(screen==='confirm') return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 px-8 py-4 flex items-center gap-4">
        <button onClick={()=>setScreen('cart')} className="text-gray-400 hover:text-white">← Retour</button>
        <h1 className="text-xl font-bold">Confirmation</h1>
      </header>
      <div className="flex-1 p-8 max-w-lg mx-auto w-full">
        <h2 className="text-2xl font-bold mb-6">Récapitulatif</h2>
        <div className="space-y-3 mb-8">
          {cart.items.map((item,i)=>(
            <div key={i} className="flex justify-between">
              <span className="text-gray-300">{item.quantity}× {item.productName}</span>
              <span className="font-semibold">{formatPrice((item.unitPrice + item.selectedOptions.reduce((s,o)=>s+o.priceModifier,0))*item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-700 pt-4 mb-8">
          <div className="flex justify-between text-xl font-bold">
            <span>Total</span>
            <span className="text-orange-500">{formatPrice(cart.getTotal())}</span>
          </div>
        </div>
        <button onClick={placeOrder} disabled={placing} className="w-full bg-orange-500 text-white py-4 rounded-2xl text-xl font-black hover:bg-orange-600 transition-colors disabled:opacity-60">
          {placing?'Envoi en cours...':'Confirmer la commande'}
        </button>
      </div>
    </div>
  )

  if(screen==='cart') return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 px-8 py-4 flex items-center justify-between">
        <button onClick={()=>setScreen('menu')} className="text-gray-400 hover:text-white">← Menu</button>
        <h1 className="text-xl font-bold">Mon panier ({cart.getItemCount()})</h1>
        <button onClick={cart.clearCart} className="text-red-400 text-sm hover:text-red-300">Vider</button>
      </header>
      <div className="flex-1 p-6 space-y-3">
        {cart.items.map((item,i)=>(
          <div key={i} className="bg-gray-800 rounded-xl p-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold">{item.productName}</p>
              {item.selectedOptions.length>0&&<p className="text-xs text-gray-400">{item.selectedOptions.map(o=>o.optionName).join(', ')}</p>}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={()=>cart.updateQuantity(i,item.quantity-1)} className="w-8 h-8 rounded-full bg-gray-700 font-bold hover:bg-gray-600">−</button>
              <span className="w-6 text-center font-bold">{item.quantity}</span>
              <button onClick={()=>cart.updateQuantity(i,item.quantity+1)} className="w-8 h-8 rounded-full bg-gray-700 font-bold hover:bg-gray-600">+</button>
            </div>
            <span className="font-bold text-orange-400">{formatPrice((item.unitPrice+item.selectedOptions.reduce((s,o)=>s+o.priceModifier,0))*item.quantity)}</span>
          </div>
        ))}
      </div>
      <div className="p-6 bg-gray-800 border-t border-gray-700">
        <div className="flex justify-between text-xl font-bold mb-4">
          <span>Total</span>
          <span className="text-orange-500">{formatPrice(cart.getTotal())}</span>
        </div>
        <button onClick={()=>setScreen('confirm')} className="w-full bg-orange-500 text-white py-4 rounded-2xl text-xl font-black hover:bg-orange-600 transition-colors">
          Commander
        </button>
      </div>
    </div>
  )

  // MENU screen
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center font-black text-lg">O</div>
          <h1 className="text-xl font-bold">{restaurant?.name}</h1>
        </div>
        {cart.getItemCount()>0&&(
          <button onClick={()=>setScreen('cart')} className="bg-orange-500 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-orange-600 transition-colors">
            🛒 {cart.getItemCount()} — {formatPrice(cart.getTotal())}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {categories.map(cat=>(
          <div key={cat.id} className="mb-8">
            <h2 className="text-lg font-bold text-orange-400 mb-4">{cat.name}</h2>
            <div className="grid grid-cols-2 gap-4">
              {cat.products.filter(p=>p.isAvailable).map(product=>(
                <button key={product.id} onClick={()=>{setSelectedProduct(product);setQty(1)}}
                  className="bg-gray-800 rounded-xl p-4 text-left hover:bg-gray-700 transition-colors border border-gray-700 hover:border-orange-500">
                  {product.imageUrl&&<img src={product.imageUrl} alt={product.name} className="w-full h-32 object-cover rounded-lg mb-3"/>}
                  <p className="font-semibold">{product.name}</p>
                  {product.description&&<p className="text-xs text-gray-400 mt-1 line-clamp-2">{product.description}</p>}
                  <p className="text-orange-500 font-bold mt-2">{formatPrice(Number(product.price))}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Product modal */}
      {selectedProduct&&(
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
                {selectedProduct.description&&<p className="text-gray-400 text-sm mt-1">{selectedProduct.description}</p>}
                <p className="text-orange-500 font-bold mt-2">{formatPrice(Number(selectedProduct.price))}</p>
              </div>
              <button onClick={()=>setSelectedProduct(null)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>

            <div className="flex items-center justify-center gap-6 my-6">
              <button onClick={()=>setQty(q=>Math.max(1,q-1))} className="w-12 h-12 rounded-full bg-gray-700 text-xl font-bold hover:bg-gray-600">−</button>
              <span className="text-3xl font-black w-10 text-center">{qty}</span>
              <button onClick={()=>setQty(q=>q+1)} className="w-12 h-12 rounded-full bg-orange-500 text-xl font-bold hover:bg-orange-600">+</button>
            </div>

            <button onClick={()=>{
              cart.addItem({
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                unitPrice: Number(selectedProduct.price),
                quantity: qty,
                selectedOptions: [],
              })
              setSelectedProduct(null)
            }} className="w-full bg-orange-500 text-white py-4 rounded-xl text-lg font-black hover:bg-orange-600 transition-colors">
              Ajouter {formatPrice(Number(selectedProduct.price)*qty)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
