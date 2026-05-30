import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../../store/cart'
import { api, fmtFCFA } from '../../lib/api'
import { MOCK_CATEGORIES, type Product, type OptionGroup } from '../../data/mock'

type Screen = 'idle' | 'categories' | 'products' | 'cart' | 'payment' | 'ticket'

const PAYMENTS = [
  { id:'wave',       name:'Wave',           desc:'Paiement mobile rapide',   emoji:'🌊', color:'from-blue-500 to-blue-600',     border:'border-blue-200',    bg:'bg-blue-50',    text:'text-blue-700' },
  { id:'orange',     name:'Orange Money',   desc:'Paiement mobile Orange',   emoji:'🟠', color:'from-orange-500 to-orange-600', border:'border-orange-200',  bg:'bg-orange-50',  text:'text-orange-700' },
  { id:'carte',      name:'Carte bancaire', desc:'Visa, Mastercard, GIM',    emoji:'💳', color:'from-slate-700 to-slate-800',   border:'border-slate-200',   bg:'bg-slate-50',   text:'text-slate-700' },
  { id:'especes',    name:'Espèces',        desc:'Payez à l\'accueil',        emoji:'💵', color:'from-emerald-500 to-emerald-600',border:'border-emerald-200', bg:'bg-emerald-50', text:'text-emerald-700' },
]

function fmtFCFAStr(n: number) { return new Intl.NumberFormat('fr-SN',{maximumFractionDigits:0}).format(n)+' F' }

// ── Idle Screen ──────────────────────────────────────────────────────────────
function IdleScreen({ onStart }: { onStart: () => void }) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onStart}
      className="w-full h-full relative overflow-hidden cursor-pointer select-none"
      style={{background:'linear-gradient(160deg,#0E3B43 0%,#1A5560 40%,#0E3B43 100%)'}}>
      <div className="absolute inset-0 overflow-hidden">
        {[0,1,2].map(i=>(
          <motion.div key={i} animate={{scale:[1,1.15+i*0.05,1],rotate:[0,8-i*3,0]}} transition={{duration:8+i*2,repeat:Infinity,ease:'easeInOut',delay:i*1.5}}
            className="absolute rounded-full opacity-15" style={{background:'radial-gradient(circle,#FF5A36,transparent 70%)',
              width:`${500+i*100}px`,height:`${500+i*100}px`,
              top:i===0?'-20%':i===1?'60%':'40%',left:i===0?'60%':i===1?'-20%':'30%'}}/>
        ))}
      </div>
      <div className="relative z-10 flex flex-col items-center justify-between h-full py-16 px-10">
        <motion.div initial={{y:-20,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:.2,ease:[.16,1,.3,1]}} className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-[28px] bg-coral shadow-2xl shadow-coral/50 flex items-center justify-center mb-5">
            <span className="font-display font-black text-white text-5xl">O</span>
          </div>
          <h1 className="font-display font-bold text-white text-5xl">Omegasen</h1>
          <p className="text-white/50 text-xl mt-1">La vraie cuisine sénégalaise</p>
        </motion.div>
        <motion.div animate={{y:[0,-12,0]}} transition={{duration:4,repeat:Infinity,ease:'easeInOut'}} className="flex flex-col items-center">
          <div className="text-[120px] leading-none mb-4">🍽️</div>
          <div className="flex gap-3 flex-wrap justify-center">
            {['Thiéboudienne','Yassa','Mafé','Dibi'].map(p=>(
              <span key={p} className="bg-white/10 text-white/60 px-4 py-2 rounded-full text-lg backdrop-blur-sm">{p}</span>
            ))}
          </div>
        </motion.div>
        <motion.div initial={{y:20,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:.4}} className="flex flex-col items-center gap-5">
          <div className="relative">
            <motion.div animate={{scale:[1,1.4,1],opacity:[.5,0,.5]}} transition={{duration:2,repeat:Infinity}} className="absolute inset-0 rounded-full bg-coral"/>
            <div className="relative bg-coral rounded-full px-16 py-6 shadow-2xl shadow-coral/60 active:scale-95 transition-transform">
              <span className="font-display font-bold text-white text-2xl">Commander</span>
            </div>
          </div>
          <p className="text-white/30 text-lg">Touchez pour commencer</p>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Categories Screen ────────────────────────────────────────────────────────
function CategoriesScreen({ onSelect, onBack }: { onSelect:(id:string)=>void; onBack:()=>void }) {
  return (
    <div className="w-full h-full bg-ivory flex flex-col overflow-hidden">
      <div className="bg-teal px-8 pt-10 pb-6 shrink-0">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white text-2xl active:scale-90 transition-transform">←</button>
          <div><p className="text-white/50 text-base">Menu</p><h1 className="font-display font-bold text-white text-3xl">Que voulez-vous manger ?</h1></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 pb-10">
        <div className="grid grid-cols-2 gap-5">
          {MOCK_CATEGORIES.map((cat,i)=>(
            <motion.button key={cat.id} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*.07,ease:[.16,1,.3,1]}}
              onClick={()=>onSelect(cat.id)} className="relative overflow-hidden rounded-3xl aspect-square flex flex-col items-start justify-end p-7 active:scale-[.96] transition-transform">
              <div className={`absolute inset-0 bg-gradient-to-br ${cat.gradient}`}/>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"/>
              <motion.div animate={{y:[0,-8,0]}} transition={{duration:3+i*.5,repeat:Infinity,ease:'easeInOut'}} className="absolute top-5 right-5 text-6xl">{cat.emoji}</motion.div>
              <div className="absolute top-5 left-5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                <span className="text-white/90 text-sm">{cat.products.filter(p=>p.isAvailable).length} plats</span>
              </div>
              <div className="relative z-10">
                <p className="font-display font-bold text-white text-3xl leading-tight">{cat.name}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Product Modal ────────────────────────────────────────────────────────────
function ProductModal({ product, onClose, onAdd }: { product:Product; onClose:()=>void; onAdd:(opts:any,qty:number)=>void }) {
  const [qty,setQty]=useState(1)
  const [sel,setSel]=useState<Record<string,string[]>>({})

  function toggle(group:OptionGroup,optId:string) {
    setSel(prev=>{
      const cur=prev[group.id]??[]
      if(group.maxChoices===1) return{...prev,[group.id]:[optId]}
      if(cur.includes(optId)) return{...prev,[group.id]:cur.filter(id=>id!==optId)}
      if(cur.length>=group.maxChoices) return prev
      return{...prev,[group.id]:[...cur,optId]}
    })
  }

  function computeTotal() {
    let p=product.price
    for(const g of product.optionGroups) for(const oid of sel[g.id]??[]) { const o=g.options.find(x=>x.id===oid); if(o) p+=o.priceModifier }
    return p*qty
  }

  function canAdd() { return product.optionGroups.every(g=>!g.isRequired||(sel[g.id]?.length??0)>0) }

  function handleAdd() {
    const opts=product.optionGroups.flatMap(g=>(sel[g.id]??[]).map(oid=>{const o=g.options.find(x=>x.id===oid)!;return{groupId:g.id,optionId:oid,name:o.name,price:o.priceModifier}}))
    onAdd(opts,qty); onClose()
  }

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
      <motion.div initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type:'spring',stiffness:300,damping:35}}
        onClick={e=>e.stopPropagation()} className="relative w-full bg-ivory rounded-t-[40px] overflow-hidden max-h-[90%] flex flex-col">
        <div className={`h-56 bg-gradient-to-br ${product.gradient} relative shrink-0`}>
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"/>
          <button onClick={onClose} className="absolute top-5 right-5 w-12 h-12 rounded-full bg-black/30 flex items-center justify-center text-white text-2xl font-bold">×</button>
          <div className="absolute bottom-5 left-7"><p className="font-display font-bold text-white text-4xl leading-tight">{product.name}</p></div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <p className="text-muted text-xl mb-4 leading-relaxed">{product.description}</p>
          <div className="flex items-center gap-3 mb-7">
            <span className="font-mono-num font-bold text-coral text-4xl">{fmtFCFAStr(product.price)}</span>
            {product.preparationTime>0&&<span className="bg-sand text-muted text-base px-4 py-2 rounded-full">⏱ {product.preparationTime}min</span>}
          </div>
          {product.optionGroups.map(group=>(
            <div key={group.id} className="mb-7">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="font-display font-bold text-ink text-2xl">{group.name}</h3>
                {group.isRequired?<span className="bg-coral/10 text-coral text-sm px-3 py-1 rounded-full font-medium">Obligatoire</span>:<span className="bg-sand text-muted text-sm px-3 py-1 rounded-full">Optionnel</span>}
              </div>
              <div className="space-y-3">
                {group.options.map(opt=>{const selected=sel[group.id]?.includes(opt.id)??false;return(
                  <button key={opt.id} onClick={()=>toggle(group,opt.id)}
                    className={`w-full flex items-center justify-between px-6 py-5 rounded-2xl border-2 transition-all active:scale-[.98] ${selected?'border-teal bg-teal/5':'border-sand bg-white hover:border-teal/30'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${selected?'border-teal bg-teal':'border-gray-300'}`}>
                        {selected&&<span className="text-white text-lg">✓</span>}
                      </div>
                      <span className={`text-xl font-medium ${selected?'text-ink':'text-muted'}`}>{opt.name}</span>
                    </div>
                    {opt.priceModifier!==0&&<span className="font-mono-num text-coral font-bold text-xl">+{fmtFCFAStr(opt.priceModifier)}</span>}
                  </button>
                )})}
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 bg-ivory border-t border-sand/50 px-8 py-5">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-4 bg-sand rounded-2xl p-2">
              <button onClick={()=>setQty(q=>Math.max(1,q-1))} className="w-14 h-14 rounded-xl bg-white flex items-center justify-center text-ink text-3xl font-bold shadow-sm active:scale-90 transition-transform">−</button>
              <span className="font-mono-num font-bold text-ink text-3xl w-10 text-center">{qty}</span>
              <button onClick={()=>setQty(q=>q+1)} className="w-14 h-14 rounded-xl bg-white flex items-center justify-center text-ink text-3xl font-bold shadow-sm active:scale-90 transition-transform">+</button>
            </div>
            <button onClick={handleAdd} disabled={!canAdd()}
              className={`flex-1 flex items-center justify-between px-7 py-5 rounded-2xl font-display font-bold text-2xl transition-all active:scale-[.97] ${canAdd()?'bg-coral text-white shadow-lg shadow-coral/40':'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
              <span>Ajouter</span><span className="font-mono-num">{fmtFCFAStr(computeTotal())}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Products Screen ──────────────────────────────────────────────────────────
function ProductsScreen({ categoryId, onBack }: { categoryId:string; onBack:()=>void }) {
  const add = useCart(s => s.add)
  const setRestaurant = useCart(s => s.setRestaurant)
  const count = useCart(s => s.count)
  const total = useCart(s => s.total)
  const [selProd, setSelProd] = useState<Product|null>(null)
  const [activeTab, setActiveTab] = useState(categoryId)
  const cat = MOCK_CATEGORIES.find(c=>c.id===activeTab)??MOCK_CATEGORIES.find(c=>c.id===categoryId)!
  const products = cat.products.filter(p=>p.isAvailable)

  return (
    <div className="w-full h-full bg-ivory flex flex-col overflow-hidden">
      <div className="bg-teal px-8 pt-10 pb-0 shrink-0">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white text-2xl active:scale-90">←</button>
          <div><p className="text-white/50 text-base">Menu</p><h1 className="font-display font-bold text-white text-3xl">{cat.name}</h1></div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-0" style={{scrollbarWidth:'none'}}>
          {MOCK_CATEGORIES.map(c=>(
            <button key={c.id} onClick={()=>setActiveTab(c.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-t-2xl text-base font-display font-semibold whitespace-nowrap transition-all ${activeTab===c.id?'bg-ivory text-ink':'text-white/60 hover:text-white/90'}`}>
              <span>{c.emoji}</span><span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 pb-44" style={{scrollbarWidth:'none'}}>
        <div className="space-y-5">
          {products.map((p,i)=>(
            <motion.button key={p.id} initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} transition={{delay:i*.06,ease:[.16,1,.3,1]}}
              onClick={()=>setSelProd(p)}
              className="w-full bg-white rounded-3xl overflow-hidden flex items-stretch shadow-sm active:scale-[.98] transition-transform">
              <div className={`w-36 bg-gradient-to-br ${p.gradient} shrink-0 flex items-center justify-center text-4xl opacity-60`}>🍽️</div>
              <div className="flex-1 p-6 text-left flex flex-col justify-between">
                <div>
                  <p className="font-display font-bold text-ink text-2xl leading-tight mb-1">{p.name}</p>
                  <p className="text-muted text-base line-clamp-2 leading-relaxed">{p.description}</p>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="font-mono-num font-bold text-coral text-2xl">{fmtFCFAStr(p.price)}</span>
                  {p.preparationTime>0&&<span className="text-muted text-sm bg-sand px-3 py-1 rounded-full">⏱ {p.preparationTime}min</span>}
                </div>
              </div>
              <div className="flex items-center pr-5">
                <div className="w-14 h-14 rounded-2xl bg-coral flex items-center justify-center text-white text-3xl font-bold shadow-md shadow-coral/30">+</div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {count()>0&&(
        <div className="fixed bottom-0 left-0 right-0 px-6 pb-6 z-40">
          <button className="w-full bg-teal text-white rounded-3xl px-8 py-5 flex items-center shadow-2xl shadow-teal/40 active:scale-[.98] transition-transform">
            <div className="w-12 h-12 rounded-2xl bg-coral flex items-center justify-center mr-5 shrink-0 font-display font-bold text-xl">{count()}</div>
            <div className="flex-1 text-left"><p className="font-display font-bold text-xl">Voir mon panier</p></div>
            <p className="font-mono-num font-bold text-2xl text-coral">{fmtFCFAStr(total())}</p>
          </button>
        </div>
      )}

      <AnimatePresence>
        {selProd&&<ProductModal product={selProd} onClose={()=>setSelProd(null)}
          onAdd={(opts,qty)=>{ add({productId:selProd.id,name:selProd.name,unitPrice:selProd.price,quantity:qty,options:opts,gradient:selProd.gradient}) }} />}
      </AnimatePresence>
    </div>
  )
}

// ── Cart Screen ──────────────────────────────────────────────────────────────
function CartScreen({ onBack, onCheckout }: { onBack:()=>void; onCheckout:()=>void }) {
  const { items, remove, setQty, total, lineTotal, clear } = useCart()
  const t = total()

  return (
    <div className="w-full h-full bg-ivory flex flex-col overflow-hidden">
      <div className="bg-teal px-8 pt-10 pb-8 shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white text-2xl active:scale-90">←</button>
          <h1 className="font-display font-bold text-white text-4xl">Mon panier</h1>
        </div>
        <p className="text-white/50 text-xl">{items.length} article{items.length>1?'s':''}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4" style={{scrollbarWidth:'none'}}>
        <AnimatePresence>
          {items.map(item=>(
            <motion.div key={item.cartId} layout initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,x:-100}} transition={{ease:[.16,1,.3,1]}}
              className="bg-white rounded-3xl overflow-hidden flex items-stretch shadow-sm">
              <div className={`w-28 bg-gradient-to-br ${item.gradient} shrink-0`}/>
              <div className="flex-1 p-5">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-display font-bold text-ink text-xl leading-tight pr-4">{item.name}</p>
                  <button onClick={()=>remove(item.cartId)} className="text-muted hover:text-red-500 transition-colors text-2xl w-10 h-10 flex items-center justify-center">×</button>
                </div>
                {item.options.length>0&&<p className="text-muted text-base mb-3">{item.options.map(o=>o.name).join(', ')}</p>}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 bg-sand rounded-xl p-1">
                    <button onClick={()=>setQty(item.cartId,item.quantity-1)} className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-ink text-2xl font-bold shadow-sm active:scale-90">−</button>
                    <span className="font-mono-num font-bold text-ink text-xl w-8 text-center">{item.quantity}</span>
                    <button onClick={()=>setQty(item.cartId,item.quantity+1)} className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-ink text-2xl font-bold shadow-sm active:scale-90">+</button>
                  </div>
                  <span className="font-mono-num font-bold text-coral text-2xl">{fmtFCFAStr(lineTotal(item))}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length===0&&(
          <div className="flex flex-col items-center justify-center py-32 text-muted">
            <span className="text-7xl mb-6">🛒</span>
            <p className="font-display font-bold text-3xl text-ink mb-2">Panier vide</p>
            <button onClick={onBack} className="mt-6 bg-coral text-white px-10 py-5 rounded-2xl font-display font-bold text-2xl shadow-lg shadow-coral/30 active:scale-95">Voir le menu</button>
          </div>
        )}
      </div>
      {items.length>0&&(
        <div className="shrink-0 bg-white border-t border-sand px-8 py-6">
          <button onClick={clear} className="w-full text-center text-muted text-xl mb-4 py-2 active:text-red-500">Vider le panier</button>
          <div className="flex items-center justify-between mb-5">
            <span className="font-display font-bold text-ink text-3xl">Total</span>
            <span className="font-mono-num font-bold text-coral text-4xl">{fmtFCFAStr(t)}</span>
          </div>
          <button onClick={onCheckout} className="w-full bg-teal text-white py-6 rounded-3xl font-display font-bold text-3xl shadow-xl shadow-teal/30 active:scale-[.97] transition-transform flex items-center justify-between px-8">
            <span>Valider et payer</span><span className="text-2xl">→</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── Payment Screen ───────────────────────────────────────────────────────────
function PaymentScreen({ onBack, onSuccess }: { onBack:()=>void; onSuccess:(orderNum:string, items:any[], total:number)=>void }) {
  const { items, total, key, clear } = useCart()
  const [sel,setSel]=useState<string|null>(null)
  const [loading,setLoading]=useState(false)

  async function confirm() {
    if(!sel) return; setLoading(true)
    try {
      const result = await api.post<any>('/api/orders/kiosk', {
        restaurantId: (import.meta.env.VITE_RESTAURANT_ID as string)?? 'rest-dakar-01',
        idempotencyKey: key,
        items: items.map(i=>({productId:i.productId,quantity:i.quantity,selectedOptions:i.options.map(o=>({groupId:o.groupId,optionId:o.optionId}))})),
      })
      const savedItems = useCart.getState().items.map(i=>({quantity:i.quantity,name:i.name})); const savedTotal = useCart.getState().total(); clear(); onSuccess(result.orderNumber, savedItems, savedTotal)
    } catch {
      // Mock
      await new Promise(r=>setTimeout(r,1500))
      const seq=String(Math.floor(Math.random()*99)+1).padStart(3,'0')
      const d=new Date(); const ds=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
      const savedItems = useCart.getState().items.map(i=>({quantity:i.quantity,name:i.name})); const savedTotal = useCart.getState().total(); clear(); onSuccess(`${ds}-${seq}`, savedItems, savedTotal)
    }
    setLoading(false)
  }

  return (
    <div className="w-full h-full bg-ivory flex flex-col overflow-hidden">
      <div className="bg-teal px-8 pt-10 pb-8 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white text-2xl active:scale-90">←</button>
          <h1 className="font-display font-bold text-white text-4xl">Paiement</h1>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-white/50 text-xl">Choisissez votre mode</p>
          <div className="bg-coral/20 rounded-2xl px-6 py-2"><span className="font-mono-num font-bold text-coral text-2xl">{fmtFCFAStr(total())}</span></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-7 space-y-5" style={{scrollbarWidth:'none'}}>
        {PAYMENTS.map((m,i)=>(
          <motion.button key={m.id} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*.08,ease:[.16,1,.3,1]}}
            onClick={()=>setSel(m.id)}
            className={`w-full flex items-center gap-6 p-7 rounded-3xl border-2 transition-all active:scale-[.97] ${sel===m.id?`${m.border} ${m.bg} shadow-lg`:'border-sand bg-white hover:border-gray-300'}`}>
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${m.color} flex items-center justify-center text-4xl shadow-md shrink-0`}>{m.emoji}</div>
            <div className="flex-1 text-left">
              <p className={`font-display font-bold text-3xl leading-tight ${sel===m.id?m.text:'text-ink'}`}>{m.name}</p>
              <p className="text-muted text-xl mt-1">{m.desc}</p>
            </div>
            <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 ${sel===m.id?`${m.border}`:'border-gray-300'}`}>
              {sel===m.id&&<div className={`w-5 h-5 rounded-full bg-gradient-to-br ${m.color}`}/>}
            </div>
          </motion.button>
        ))}
      </div>
      <div className="shrink-0 bg-white border-t border-sand px-8 py-6">
        <button onClick={confirm} disabled={!sel||loading}
          className={`w-full py-7 rounded-3xl font-display font-bold text-3xl transition-all active:scale-[.97] flex items-center justify-center gap-4 ${sel&&!loading?'bg-coral text-white shadow-2xl shadow-coral/40':'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
          {loading?<><span className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"/>Traitement...</>:<><span>Confirmer</span><span className="font-mono-num">{fmtFCFAStr(total())}</span></>}
        </button>
      </div>
    </div>
  )
}

// ── Ticket Screen ────────────────────────────────────────────────────────────
function printTicket(orderNumber: string, items: any[], total: number) {
  const w = window.open('', '_blank', 'width=380,height=600')
  if (!w) return
  const now = new Date()
  const timeStr = now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})
  const dateStr = now.toLocaleDateString('fr-FR')
  const lines = items.map(i => `<tr><td>${i.quantity}× ${i.name}</td></tr>`).join('')
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket Omegasen</title>
<style>
  body{font-family:'Courier New',monospace;width:320px;margin:0 auto;padding:16px;font-size:13px}
  .center{text-align:center}.bold{font-weight:bold}.big{font-size:32px;font-weight:bold;color:#FF5A36}
  .sep{border-top:1px dashed #999;margin:8px 0}.logo{font-size:22px;font-weight:900}
  table{width:100%}td{padding:2px 0}
  @media print{body{margin:0;padding:8px}}
</style></head><body>
<div class="center">
  <div class="logo">OMEGASEN</div>
  <div style="font-size:11px;color:#666">La vraie cuisine sénégalaise</div>
  <div style="font-size:11px;margin-top:4px">${dateStr} — ${timeStr}</div>
</div>
<div class="sep"></div>
<div class="center">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#666">Numéro de commande</div>
  <div class="big">${orderNumber}</div>
</div>
<div class="sep"></div>
<table>${lines}</table>
<div class="sep"></div>
<table><tr><td class="bold">TOTAL</td><td style="text-align:right;font-weight:bold;color:#FF5A36">${total.toLocaleString()} F</td></tr></table>
<div class="sep"></div>
<div class="center" style="font-size:11px;margin-top:8px">
  ✓ Présentez ce ticket à l'hôte<br>qui vous installera
</div>
</body></html>`)
  w.document.close()
  setTimeout(() => { w.print(); w.close() }, 500)
}

function TicketScreen({ orderNumber, items, total, onReset }: { orderNumber:string; items:any[]; total:number; onReset:()=>void }) {
  const [cd,setCd]=useState(30)
  const [printed,setPrinted]=useState(false)
  useEffect(()=>{const i=setInterval(()=>setCd(c=>{if(c<=1){onReset();return 0}return c-1}),1000);return()=>clearInterval(i)},[onReset])

  function handlePrint() { printTicket(orderNumber, items, total); setPrinted(true) }

  return (
    <div className="w-full h-full bg-teal flex flex-col items-center justify-center overflow-hidden relative">
      <div className="absolute inset-0 overflow-hidden opacity-10">
        {Array.from({length:20}).map((_,i)=>(
          <div key={i} className="absolute text-8xl" style={{left:`${(i%5)*22}%`,top:`${Math.floor(i/5)*26}%`,transform:'rotate(-15deg)'}}>✓</div>
        ))}
      </div>
      <div className="relative z-10 flex flex-col items-center px-10 w-full max-w-2xl">
        <motion.div initial={{scale:0,rotate:-180}} animate={{scale:1,rotate:0}} transition={{type:'spring',stiffness:200,damping:20,delay:.2}}
          className="w-40 h-40 rounded-full bg-coral flex items-center justify-center mb-8 shadow-2xl shadow-coral/50">
          <motion.span initial={{opacity:0,scale:0}} animate={{opacity:1,scale:1}} transition={{delay:.5,type:'spring',stiffness:300}}
            className="text-white font-bold leading-none" style={{fontSize:'80px'}}>✓</motion.span>
        </motion.div>
        <motion.h1 initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.4}} className="font-display font-bold text-white text-5xl mb-2 text-center">Commande confirmée !</motion.h1>
        <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.5}} className="text-white/60 text-2xl text-center mb-10">Votre numéro de commande</motion.p>
        <motion.div initial={{y:-40,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:.3,type:'spring',stiffness:200,damping:25}}
          className="w-full bg-ivory rounded-3xl overflow-hidden shadow-2xl mb-8">
          <div className="bg-coral px-10 py-5 flex items-center justify-between">
            <div><p className="font-display font-bold text-white text-2xl">Omegasen</p><p className="text-white/70 text-base">La vraie cuisine sénégalaise</p></div>
            <p className="text-white/70 text-base">{new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</p>
          </div>
          <div className="px-10 py-8 text-center border-b-2 border-dashed border-sand">
            <p className="text-muted text-xl uppercase tracking-widest mb-2">Numéro de commande</p>
            <p className="font-mono-num font-bold text-coral" style={{fontSize:'80px',lineHeight:1}}>{orderNumber}</p>
          </div>
          <div className="px-10 py-4">
            {items.map((item,i) => (
              <div key={i} className="flex justify-between py-1 text-muted text-base">
                <span>{item.quantity}× {item.name}</span>
              </div>
            ))}
          </div>
          <div className="px-10 py-4 border-t border-sand text-center"><p className="text-muted text-base">Présentez ce numéro à l'hôte</p></div>
        </motion.div>

        {/* Print button */}
        <motion.button initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:.6}}
          onClick={handlePrint}
          className={`w-full mb-5 py-5 rounded-3xl font-display font-bold text-2xl transition-all active:scale-[.97] flex items-center justify-center gap-3 ${printed?'bg-white/20 text-white/60 border-2 border-white/20':'bg-white text-teal shadow-xl hover:bg-ivory'}`}>
          🖨️ {printed ? 'Ticket imprimé ✓' : 'Imprimer le ticket'}
        </motion.button>

        <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.7}} className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3 text-white/60">
            <svg className="w-8 h-8" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" opacity=".3"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="white" strokeWidth="2.5"
                strokeDasharray={`${(cd/30)*94} 94`} strokeLinecap="round" transform="rotate(-90 18 18)"
                style={{transition:'stroke-dasharray 1s linear'}}/>
            </svg>
            <p className="text-xl">Retour dans <span className="font-mono-num font-bold text-white text-2xl">{cd}s</span></p>
          </div>
          <button onClick={onReset} className="bg-white/20 text-white border-2 border-white/30 px-10 py-4 rounded-2xl font-display font-bold text-2xl active:scale-95">Nouvelle commande</button>
        </motion.div>
      </div>
    </div>
  )
}

// ── Main Kiosk ───────────────────────────────────────────────────────────────
export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>('idle')
  const [categoryId, setCategoryId] = useState('plats')
  const [orderNumber, setOrderNumber] = useState('')
  const [orderItems, setOrderItems] = useState<any[]>([])
  const [orderTotal, setOrderTotal] = useState(0)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>()
  const clear = useCart(s => s.clear)

  function resetIdle() {
    clearTimeout(idleTimer.current)
    if(screen!=='idle'&&screen!=='ticket') {
      idleTimer.current=setTimeout(()=>{clear();setScreen('idle')},90000)
    }
  }

  useEffect(()=>{ resetIdle(); return()=>clearTimeout(idleTimer.current) },[screen])

  const screens: Record<Screen,React.ReactNode> = {
    idle: <IdleScreen onStart={()=>setScreen('categories')}/>,
    categories: <CategoriesScreen onSelect={id=>{setCategoryId(id);setScreen('products')}} onBack={()=>setScreen('idle')}/>,
    products: <ProductsScreen categoryId={categoryId} onBack={()=>setScreen('categories')}/>,
    cart: <CartScreen onBack={()=>setScreen('products')} onCheckout={()=>setScreen('payment')}/>,
    payment: <PaymentScreen onBack={()=>setScreen('cart')} onSuccess={(n,items,total)=>{setOrderNumber(n);setOrderItems(items);setOrderTotal(total);setScreen('ticket')}}/>,
    ticket: <TicketScreen orderNumber={orderNumber} items={orderItems} total={orderTotal} onReset={()=>{setScreen('idle');setOrderNumber('');setOrderItems([]);setOrderTotal(0)}}/>,
  }

  return (
    <div className="fixed inset-0 overflow-hidden" onClick={resetIdle} onTouchStart={resetIdle}>
      <AnimatePresence mode="wait">
        <motion.div key={screen} initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-12}}
          transition={{duration:.25,ease:[.16,1,.3,1]}} className="absolute inset-0">
          {screens[screen]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
