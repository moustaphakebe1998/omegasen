import { describe, expect, it } from "vitest";

import { teamAccess } from "@/components/manage/team/team-data";
import { homeFor, type User } from "@/lib/auth";
import type { MemberRole } from "@/lib/labels";
import type { Perm } from "@/lib/permissions";

function user(role: MemberRole, permissions: Perm[] = [], blocked: string | null = null): User {
  return {
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
        restaurant_status: blocked ? "SUSPENDED" : "ACTIVE",
        role,
        permissions,
        station_id: null,
        access_blocked: blocked,
        access_message: blocked ? "Votre restaurant a été temporairement suspendu." : null,
      },
    ],
  };
}

describe("hiérarchie des rôles (équipe)", () => {
  it("le propriétaire gère et attribue tous les rôles", () => {
    const a = teamAccess(user("OWNER"), "r1", "OWNER");
    expect(a.grantableRoles).toEqual(["OWNER", "ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "STAFF"]);
    expect(a.canManageRole("OWNER")).toBe(true);
  });

  it("un administrateur ne gère que les rangs inférieurs", () => {
    const a = teamAccess(user("ADMIN"), "r1", "ADMIN");
    expect(a.grantableRoles).toEqual(["MANAGER", "CASHIER", "WAITER", "KITCHEN", "STAFF"]);
    expect(a.canManageRole("ADMIN")).toBe(false);
    expect(a.canManageRole("OWNER")).toBe(false);
  });

  it("un responsable ne gère que le personnel opérationnel", () => {
    const a = teamAccess(user("MANAGER"), "r1", "MANAGER");
    expect(a.grantableRoles).toEqual(["CASHIER", "WAITER", "KITCHEN", "STAFF"]);
    expect(a.canManageRole("MANAGER")).toBe(false);
  });

  it("le super admin gère tout le monde", () => {
    const a = teamAccess({ ...user("STAFF"), is_superadmin: true, memberships: [] }, "r1", null);
    expect(a.canManageRole("OWNER")).toBe(true);
  });
});

describe("homeFor et restaurants bloqués", () => {
  it("serveur → caisse en prise de commande", () => {
    expect(homeFor(user("WAITER", ["orders.create"]))).toBe("/pos/r1");
  });

  it("restaurant suspendu → écran du motif dans l'espace du restaurant", () => {
    expect(homeFor(user("KITCHEN", ["orders.prepare"], "restaurant_suspended"))).toBe("/manage/r1");
  });
});
