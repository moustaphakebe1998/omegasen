import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { User } from "@/lib/auth";
import { actionErrorMessage, can, canAll, isPermissionDenied, membershipIn } from "@/lib/permissions";

const base: User = {
  id: "u1",
  email: "a@example.com",
  full_name: "A",
  phone: null,
  is_superadmin: false,
  account_type: "STAFF",
  must_change_password: false,
  memberships: [
    {
      restaurant_id: "r1",
      restaurant_name: "R1",
      restaurant_slug: "r1",
      restaurant_status: "ACTIVE",
      role: "KITCHEN",
      permissions: ["restaurant.view", "stock.manage", "orders.prepare"],
      station_id: "s1",
    },
  ],
};

describe("can", () => {
  it("lit les permissions de l'adhésion", () => {
    expect(can(base, "r1", "orders.prepare")).toBe(true);
    expect(can(base, "r1", "menu.delete")).toBe(false);
    expect(can(base, "r2", "orders.prepare")).toBe(false);
  });

  it("donne tout au super admin", () => {
    expect(can({ ...base, is_superadmin: true, memberships: [] }, "r9", "team.manage")).toBe(true);
  });

  it("refuse sans utilisateur", () => {
    expect(can(null, "r1", "restaurant.view")).toBe(false);
  });

  it("exige toutes les permissions avec canAll", () => {
    expect(canAll(base, "r1", ["restaurant.view", "stock.manage"])).toBe(true);
    expect(canAll(base, "r1", ["menu.create", "prices.edit"])).toBe(false);
  });
});

describe("membershipIn", () => {
  it("retrouve l'adhésion et son poste", () => {
    expect(membershipIn(base, "r1")?.station_id).toBe("s1");
    expect(membershipIn(base, "r2")).toBeNull();
    expect(membershipIn(null, "r1")).toBeNull();
  });
});

describe("isPermissionDenied", () => {
  it("reconnaît l'erreur 403 permission_denied", () => {
    expect(isPermissionDenied(new ApiError(403, "permission_denied", "x"))).toBe(true);
    expect(isPermissionDenied(new ApiError(403, "forbidden", "x"))).toBe(false);
    expect(isPermissionDenied(new Error("x"))).toBe(false);
  });
});

describe("actionErrorMessage", () => {
  it("uniformise le message de refus", () => {
    expect(actionErrorMessage(new ApiError(403, "permission_denied", "Refusé pour ce changement"))).toBe(
      "Vous n'avez pas la permission pour cette action",
    );
    expect(actionErrorMessage(new ApiError(409, "conflict", "Déjà pris"))).toBe("Déjà pris");
  });
});
