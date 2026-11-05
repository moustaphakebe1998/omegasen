import { describe, expect, it } from "vitest";

import { shiftDay, timeSlots, todayIn, zonedIso } from "../reservations";

describe("zonedIso", () => {
  it("Dakar est en UTC+0", () => {
    expect(zonedIso("2026-11-06", "20:00", "Africa/Dakar")).toBe("2026-11-06T20:00:00+00:00");
  });
  it("Paris : heure d'hiver et heure d'été", () => {
    expect(zonedIso("2026-11-06", "20:00", "Europe/Paris")).toBe("2026-11-06T20:00:00+01:00");
    expect(zonedIso("2026-07-14", "12:30", "Europe/Paris")).toBe("2026-07-14T12:30:00+02:00");
  });
  it("fuseau négatif", () => {
    expect(zonedIso("2026-01-10", "09:00", "America/Montreal")).toBe("2026-01-10T09:00:00-05:00");
  });
});

describe("jours", () => {
  it("todayIn suit le fuseau", () => {
    const now = new Date("2026-11-05T23:30:00Z");
    expect(todayIn("Africa/Dakar", now)).toBe("2026-11-05");
    expect(todayIn("Europe/Paris", now)).toBe("2026-11-06");
  });
  it("shiftDay traverse les mois", () => {
    expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("timeSlots", () => {
  const hours = [{ day_of_week: 4, opens_at: "12:00:00", closes_at: "14:00:00" }]; // vendredi
  it("créneaux de 30 min dans les horaires du jour", () => {
    expect(timeSlots("2026-11-06", hours as never)).toEqual(["12:00", "12:30", "13:00", "13:30"]);
    expect(timeSlots("2026-11-07", hours as never)).toEqual([]);
  });
  it("ouvert toute la journée", () => {
    const all = [{ day_of_week: 4, opens_at: "00:00:00", closes_at: "23:59:00" }];
    const slots = timeSlots("2026-11-06", all as never);
    expect(slots[0]).toBe("00:00");
    expect(slots.at(-1)).toBe("23:30");
    expect(timeSlots("2026-11-06", all as never, 20 * 60)[0]).toBe("20:00");
  });
});
