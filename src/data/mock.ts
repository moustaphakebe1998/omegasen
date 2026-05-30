export interface OptionGroup { id:string; name:string; isRequired:boolean; minChoices:number; maxChoices:number; options:{id:string;name:string;priceModifier:number}[] }
export interface Product { id:string; name:string; description:string; price:number; gradient:string; isAvailable:boolean; preparationTime:number; optionGroups:OptionGroup[] }
export interface Category { id:string; name:string; emoji:string; gradient:string; products:Product[] }

export const MOCK_CATEGORIES: Category[] = [
  { id:'plats', name:'Plats', emoji:'🍽️', gradient:'from-amber-400 to-orange-500',
    products:[
      { id:'thieb', name:'Thiéboudienne', description:'Le plat national. Riz au poisson, légumes braisés, sauce tomate maison.', price:3500, gradient:'from-amber-500 via-orange-400 to-red-400', isAvailable:true, preparationTime:15,
        optionGroups:[
          { id:'taille',name:'Taille',isRequired:true,minChoices:1,maxChoices:1, options:[{id:'normal',name:'Normal',priceModifier:0},{id:'grand',name:'Grand',priceModifier:500},{id:'familial',name:'Familial ×2',priceModifier:2500}] },
          { id:'extras',name:'Suppléments',isRequired:false,minChoices:0,maxChoices:3, options:[{id:'cepp',name:'Sauce cepp',priceModifier:200},{id:'yeet',name:'Yeet fumé',priceModifier:300}] }
        ]},
      { id:'yassa', name:'Yassa Poulet', description:'Poulet mariné, oignons confits au citron, moutarde. Riz blanc parfumé.', price:3000, gradient:'from-yellow-400 via-amber-300 to-orange-300', isAvailable:true, preparationTime:12,
        optionGroups:[
          { id:'ty',name:'Taille',isRequired:true,minChoices:1,maxChoices:1, options:[{id:'ny',name:'Normal',priceModifier:0},{id:'gy',name:'Grand',priceModifier:500}] },
          { id:'pref',name:'Préférences',isRequired:false,minChoices:0,maxChoices:2, options:[{id:'mo',name:"Moins d'oignons",priceModifier:0},{id:'pm',name:'Extra piment',priceModifier:0}] }
        ]},
      { id:'mafe', name:'Mafé Viande', description:'Ragoût de bœuf en sauce arachide crémeuse. Riz blanc.', price:3200, gradient:'from-amber-700 via-amber-500 to-yellow-400', isAvailable:true, preparationTime:20,
        optionGroups:[{id:'tm',name:'Taille',isRequired:true,minChoices:1,maxChoices:1,options:[{id:'nm',name:'Normal',priceModifier:0},{id:'gm',name:'Grand',priceModifier:500}]}]},
    ]},
  { id:'grillades', name:'Grillades', emoji:'🔥', gradient:'from-red-500 to-orange-600',
    products:[
      { id:'dibi', name:'Dibi Haalpulaar', description:'Mouton grillé à la braise, épices traditionnelles. Avec pain ou riz.', price:4500, gradient:'from-red-600 via-orange-500 to-amber-400', isAvailable:true, preparationTime:20,
        optionGroups:[
          { id:'acc',name:'Accompagnement',isRequired:true,minChoices:1,maxChoices:1, options:[{id:'pain',name:'Avec pain',priceModifier:0},{id:'riz',name:'Avec riz',priceModifier:200},{id:'att',name:'Attiéké',priceModifier:300}] },
          { id:'sd',name:'Sauce',isRequired:false,minChoices:0,maxChoices:2, options:[{id:'mo',name:'Moutarde locale',priceModifier:0},{id:'ph',name:'Piment habanero',priceModifier:0}] }
        ]},
      { id:'brochettes', name:'Brochettes Bœuf', description:'6 brochettes marinées, grillées braise. Oignons frits, sauce tomate.', price:2500, gradient:'from-orange-600 via-red-500 to-pink-500', isAvailable:true, preparationTime:15,
        optionGroups:[{id:'nb',name:'Nombre',isRequired:true,minChoices:1,maxChoices:1,options:[{id:'6',name:'6 brochettes',priceModifier:0},{id:'10',name:'10 brochettes',priceModifier:1500}]}]},
    ]},
  { id:'boissons', name:'Boissons', emoji:'🥤', gradient:'from-rose-400 to-pink-600',
    products:[
      { id:'bissap', name:'Bissap', description:'Jus d\'hibiscus traditionnel, frais et légèrement sucré.', price:600, gradient:'from-pink-500 via-rose-400 to-red-400', isAvailable:true, preparationTime:2,
        optionGroups:[{id:'sucre',name:'Sucre',isRequired:false,minChoices:0,maxChoices:1,options:[{id:'ss',name:'Sans sucre',priceModifier:0},{id:'ps',name:'Peu sucré',priceModifier:0}]}]},
      { id:'ginger', name:'Jus Gingembre', description:'Gingembre frais, citron, menthe. Tonique et revigorant.', price:700, gradient:'from-amber-300 via-yellow-300 to-lime-300', isAvailable:true, preparationTime:2, optionGroups:[] },
      { id:'eau', name:'Eau Minérale', description:'Bouteille fraîche.', price:300, gradient:'from-sky-200 to-blue-300', isAvailable:true, preparationTime:0,
        optionGroups:[{id:'fmt',name:'Format',isRequired:true,minChoices:1,maxChoices:1,options:[{id:'50',name:'50cl',priceModifier:0},{id:'150',name:'1.5L',priceModifier:300}]}]},
    ]},
  { id:'desserts', name:'Desserts', emoji:'🍮', gradient:'from-violet-400 to-purple-600',
    products:[
      { id:'thiakry', name:'Thiakry', description:'Semoule de mil sucrée au lait caillé, vanille et fleur d\'oranger.', price:600, gradient:'from-amber-100 via-yellow-200 to-amber-300', isAvailable:true, preparationTime:0, optionGroups:[] },
    ]},
]
