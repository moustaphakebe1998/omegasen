// prisma/seed.ts — Données de seed réalistes pour Omegasen

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Omegasen database...");

  const BCRYPT_ROUNDS = 12;
  const hashPwd = (pw: string) => bcrypt.hash(pw, BCRYPT_ROUNDS);

  // ── Restaurants ──────────────────────────────

  const restaurant1 = await prisma.restaurant.upsert({
    where: { slug: "omegasen-paris-1" },
    update: {},
    create: {
      name: "Omegasen Paris 1",
      slug: "omegasen-paris-1",
      address: "42 rue de Rivoli, 75001 Paris",
      phone: "+33 1 42 00 00 01",
      email: "paris1@omegasen.com",
      currency: "EUR",
      taxRate: 0.1,
      timezone: "Europe/Paris",
      isActive: true,
    },
  });

  const restaurant2 = await prisma.restaurant.upsert({
    where: { slug: "omegasen-lyon" },
    update: {},
    create: {
      name: "Omegasen Lyon",
      slug: "omegasen-lyon",
      address: "15 place Bellecour, 69002 Lyon",
      phone: "+33 4 78 00 00 02",
      email: "lyon@omegasen.com",
      currency: "EUR",
      taxRate: 0.1,
      timezone: "Europe/Paris",
      isActive: true,
    },
  });

  console.log("✅ Restaurants créés");

  // ── Utilisateurs ─────────────────────────────

  const ceo = await prisma.user.upsert({
    where: { email: "ceo@omegasen.com" },
    update: {},
    create: {
      email: "ceo@omegasen.com",
      passwordHash: await hashPwd("Omegasen2024!"),
      firstName: "Sophie",
      lastName: "Martin",
      role: "CEO",
      isActive: true,
    },
  });

  const manager1 = await prisma.user.upsert({
    where: { email: "manager.paris@omegasen.com" },
    update: {},
    create: {
      email: "manager.paris@omegasen.com",
      passwordHash: await hashPwd("Manager2024!"),
      firstName: "Lucas",
      lastName: "Dupont",
      role: "MANAGER",
      isActive: true,
    },
  });

  const manager2 = await prisma.user.upsert({
    where: { email: "manager.lyon@omegasen.com" },
    update: {},
    create: {
      email: "manager.lyon@omegasen.com",
      passwordHash: await hashPwd("Manager2024!"),
      firstName: "Emma",
      lastName: "Bernard",
      role: "MANAGER",
      isActive: true,
    },
  });

  const kitchen1 = await prisma.user.upsert({
    where: { email: "cuisine.paris@omegasen.com" },
    update: {},
    create: {
      email: "cuisine.paris@omegasen.com",
      passwordHash: await hashPwd("Kitchen2024!"),
      firstName: "Cuisine",
      lastName: "Paris",
      role: "KITCHEN",
      isActive: true,
    },
  });

  // Associations user-restaurant
  await prisma.userRestaurant.upsert({
    where: { userId_restaurantId: { userId: manager1.id, restaurantId: restaurant1.id } },
    update: {},
    create: { userId: manager1.id, restaurantId: restaurant1.id, role: "MANAGER" },
  });

  await prisma.userRestaurant.upsert({
    where: { userId_restaurantId: { userId: manager2.id, restaurantId: restaurant2.id } },
    update: {},
    create: { userId: manager2.id, restaurantId: restaurant2.id, role: "MANAGER" },
  });

  await prisma.userRestaurant.upsert({
    where: { userId_restaurantId: { userId: kitchen1.id, restaurantId: restaurant1.id } },
    update: {},
    create: { userId: kitchen1.id, restaurantId: restaurant1.id, role: "KITCHEN" },
  });

  console.log("✅ Utilisateurs créés");

  // ── Menu Restaurant 1 ─────────────────────────

  // Catégories
  const categories = [
    { name: "Entrées", slug: "entrees", sortOrder: 1 },
    { name: "Burgers", slug: "burgers", sortOrder: 2 },
    { name: "Bowls", slug: "bowls", sortOrder: 3 },
    { name: "Accompagnements", slug: "accompagnements", sortOrder: 4 },
    { name: "Desserts", slug: "desserts", sortOrder: 5 },
    { name: "Boissons", slug: "boissons", sortOrder: 6 },
  ];

  const catMap: Record<string, string> = {};
  for (const cat of categories) {
    const c = await prisma.menuCategory.upsert({
      where: { restaurantId_slug: { restaurantId: restaurant1.id, slug: cat.slug } },
      update: {},
      create: {
        restaurantId: restaurant1.id,
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        isVisible: true,
      },
    });
    catMap[cat.slug] = c.id;
  }

  // Produits
  const products = [
    // Burgers
    {
      categorySlug: "burgers",
      name: "Classic Burger",
      slug: "classic-burger",
      description: "Steak haché 180g, cheddar, salade, tomate, oignon",
      price: 12.5,
      isAvailable: true,
      isFeatured: true,
      preparationTime: 12,
      options: [
        {
          name: "Cuisson",
          isRequired: true,
          minChoices: 1,
          maxChoices: 1,
          options: [
            { name: "À point", priceModifier: 0, isDefault: true },
            { name: "Bien cuit", priceModifier: 0 },
            { name: "Saignant", priceModifier: 0 },
          ],
        },
        {
          name: "Extras",
          isRequired: false,
          minChoices: 0,
          maxChoices: 3,
          options: [
            { name: "Bacon +", priceModifier: 1.5 },
            { name: "Oeuf +", priceModifier: 1.0 },
            { name: "Double steak", priceModifier: 3.5 },
          ],
        },
      ],
    },
    {
      categorySlug: "burgers",
      name: "Veggie Burger",
      slug: "veggie-burger",
      description: "Galette lentilles et betterave, avocat, sauce yaourt herbes",
      price: 11.9,
      isAvailable: true,
      preparationTime: 10,
      allergens: ["gluten", "lactose"],
      options: [],
    },
    {
      categorySlug: "burgers",
      name: "Spicy Chicken",
      slug: "spicy-chicken",
      description: "Poulet mariné épicé, coleslaw, sauce sriracha",
      price: 13.0,
      isAvailable: true,
      isFeatured: true,
      preparationTime: 14,
      promoPrice: 11.0,
      options: [
        {
          name: "Niveau de piment",
          isRequired: true,
          minChoices: 1,
          maxChoices: 1,
          options: [
            { name: "Doux", priceModifier: 0, isDefault: true },
            { name: "Moyen", priceModifier: 0 },
            { name: "Fort 🌶", priceModifier: 0 },
          ],
        },
      ],
    },
    // Bowls
    {
      categorySlug: "bowls",
      name: "Buddha Bowl",
      slug: "buddha-bowl",
      description: "Quinoa, pois chiches rôtis, légumes grillés, tahini",
      price: 13.5,
      isAvailable: true,
      preparationTime: 8,
      allergens: ["sesame"],
      options: [],
    },
    {
      categorySlug: "bowls",
      name: "Salmon Poke",
      slug: "salmon-poke",
      description: "Riz sushi, saumon mariné, edamame, sauce ponzu",
      price: 15.9,
      isAvailable: true,
      isFeatured: true,
      preparationTime: 8,
      allergens: ["poisson", "soja", "sesame"],
      options: [],
    },
    // Accompagnements
    {
      categorySlug: "accompagnements",
      name: "Frites maison",
      slug: "frites-maison",
      description: "Frites de pommes de terre fraîches, fleur de sel",
      price: 4.5,
      isAvailable: true,
      preparationTime: 8,
      options: [
        {
          name: "Sauce",
          isRequired: false,
          minChoices: 0,
          maxChoices: 1,
          options: [
            { name: "Ketchup", priceModifier: 0 },
            { name: "Mayo", priceModifier: 0 },
            { name: "Barbecue", priceModifier: 0 },
            { name: "Burger sauce", priceModifier: 0.5 },
          ],
        },
      ],
    },
    {
      categorySlug: "accompagnements",
      name: "Salade verte",
      slug: "salade-verte",
      description: "Jeunes pousses, vinaigrette maison",
      price: 3.5,
      isAvailable: true,
      preparationTime: 3,
      options: [],
    },
    // Desserts
    {
      categorySlug: "desserts",
      name: "Brownie maison",
      slug: "brownie-maison",
      description: "Brownie chocolat noir, glace vanille",
      price: 6.9,
      isAvailable: true,
      preparationTime: 5,
      allergens: ["gluten", "lactose", "oeuf"],
      options: [],
    },
    // Boissons
    {
      categorySlug: "boissons",
      name: "Limonade maison",
      slug: "limonade-maison",
      description: "Citron frais, menthe, eau pétillante",
      price: 4.5,
      isAvailable: true,
      preparationTime: 2,
      options: [
        {
          name: "Taille",
          isRequired: true,
          minChoices: 1,
          maxChoices: 1,
          options: [
            { name: "30cl", priceModifier: 0, isDefault: true },
            { name: "50cl", priceModifier: 1.5 },
          ],
        },
      ],
    },
    {
      categorySlug: "boissons",
      name: "Coca-Cola",
      slug: "coca-cola",
      description: "33cl",
      price: 3.5,
      isAvailable: true,
      preparationTime: 1,
      options: [],
    },
  ];

  for (const p of products) {
    const created = await prisma.product.upsert({
      where: { categoryId_slug: { categoryId: catMap[p.categorySlug], slug: p.slug } },
      update: {},
      create: {
        categoryId: catMap[p.categorySlug],
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: p.price,
        promoPrice: p.promoPrice,
        isAvailable: p.isAvailable,
        isFeatured: p.isFeatured ?? false,
        isVisible: true,
        allergens: p.allergens ?? [],
        preparationTime: p.preparationTime,
      },
    });

    for (const group of (p.options ?? [])) {
      const g = await prisma.productOptionGroup.create({
        data: {
          productId: created.id,
          name: group.name,
          isRequired: group.isRequired,
          minChoices: group.minChoices,
          maxChoices: group.maxChoices,
          options: {
            create: group.options.map((o, i) => ({
              name: o.name,
              priceModifier: o.priceModifier,
              isDefault: o.isDefault ?? false,
              isAvailable: true,
              sortOrder: i,
            })),
          },
        },
      });
    }
  }

  console.log("✅ Menu créé");

  // ── Horaires d'ouverture ──────────────────────

  for (let day = 0; day <= 6; day++) {
    const isClosed = day === 0; // Dimanche fermé
    await prisma.openingHours.upsert({
      where: { restaurantId_dayOfWeek: { restaurantId: restaurant1.id, dayOfWeek: day } },
      update: {},
      create: {
        restaurantId: restaurant1.id,
        dayOfWeek: day,
        openTime: "11:30",
        closeTime: "22:30",
        isClosed,
      },
    });
  }

  console.log("✅ Horaires créés");

  // ── Kiosk ─────────────────────────────────────

  await prisma.kiosk.upsert({
    where: { deviceToken: "kiosk-paris-1-demo" },
    update: {},
    create: {
      restaurantId: restaurant1.id,
      name: "Borne 1",
      deviceToken: "kiosk-paris-1-demo",
      isActive: true,
    },
  });

  console.log("✅ Kiosk créé");

  console.log("\n🎉 Seed terminé !\n");
  console.log("Comptes de connexion :");
  console.log("  CEO     : ceo@omegasen.com / Omegasen2024!");
  console.log("  Gérant  : manager.paris@omegasen.com / Manager2024!");
  console.log("  Cuisine : cuisine.paris@omegasen.com / Kitchen2024!");
  console.log("\nURL borne : /kiosk/omegasen-paris-1");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
