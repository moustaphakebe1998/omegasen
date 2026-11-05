import { describe, expect, it } from "vitest";

import type { User } from "@/lib/auth";
import { can } from "@/lib/permissions";

const base: User = {
  id: "u1",
  email: "a@example.com",
  full_name: "A",
  phone: null,
  is_superadmin: false,
  account_type: "STAFF",
  memberships: [
    {
      restaurant_id: "r1",
      restaurant_name: "R1",
      restaurant_slug: "r1",
      restaurant_status: "ACTIVE",
      role: "KITCHEN",
      permissions: ["restaurant.view", "stock.manage", "orders.prepare"],
    },
  ],
};

describe("can", () => {
  it("lit les permissions de l'adhésion", () => {
    expect(can(base, "r1", "orders.prepare")).toBe(true);
    expect(can(base, "r1", "menu.manage")).toBe(false);
    expect(can(base, "r2", "orders.prepare")).toBe(false);
  });

  it("donne tout au super admin", () => {
    expect(can({ ...base, is_superadmin: true, memberships: [] }, "r9", "team.manage")).toBe(true);
  });

  it("refuse sans utilisateur", () => {
    expect(can(null, "r1", "restaurant.view")).toBe(false);
  });
});
