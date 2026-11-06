import { describe, expect, it } from "vitest";

import { homeFor, type User } from "@/lib/auth";
import type { Perm } from "@/lib/permissions";
import { tableParam } from "@/lib/tables";

function member(role: User["memberships"][number]["role"], permissions: Perm[]): User {
  return {
    id: "u1",
    email: "a@baobab.test",
    full_name: "A",
    phone: null,
    is_superadmin: false,
    account_type: "STAFF",
    must_change_password: false,
    memberships: [
      {
        restaurant_id: "r1",
        restaurant_name: "Restaurant Baobab",
        restaurant_slug: "baobab",
        restaurant_status: "ACTIVE",
        role,
        permissions,
        station_id: null,
      },
    ],
  };
}

describe("homeFor", () => {
  it("envoie la cuisine et la caisse sur leur écran", () => {
    expect(homeFor(member("KITCHEN", ["restaurant.view", "orders.prepare"]))).toBe("/kitchen/r1");
    expect(homeFor(member("CASHIER", ["restaurant.view", "orders.create"]))).toBe("/pos/r1");
    expect(homeFor(member("OWNER", ["restaurant.view"]))).toBe("/manage/r1");
  });

  it("tient compte des permissions restreintes par le propriétaire", () => {
    // Profil « utilisateur standard » : rôle cuisine sans l'écran cuisine.
    expect(homeFor(member("KITCHEN", ["restaurant.view", "menu.view"]))).toBe("/manage/r1");
    expect(homeFor(member("CASHIER", ["restaurant.view", "menu.view"]))).toBe("/manage/r1");
  });

  it("garde le changement de mot de passe obligatoire en priorité", () => {
    expect(homeFor({ ...member("KITCHEN", ["orders.prepare"]), must_change_password: true })).toBe(
      "/changer-mot-de-passe",
    );
  });
});

describe("tableParam", () => {
  it("accepte les étiquettes de table valides", () => {
    expect(tableParam("T5")).toBe("T5");
    expect(tableParam(["Terrasse-2", "x"])).toBe("Terrasse-2");
  });

  it("rejette les valeurs invalides ou absentes", () => {
    for (const v of [null, undefined, "", "T 5", "<script>", "x".repeat(21), "T5?a=b"]) {
      expect(tableParam(v)).toBeNull();
    }
  });
});
