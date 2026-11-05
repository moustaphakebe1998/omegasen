import { describe, expect, it } from "vitest";

import { formatElapsed, formatMoney, moneyInput, parseMoney } from "@/lib/format";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("formatMoney", () => {
  it("EUR en centimes", () => expect(nbsp(formatMoney(1250, "EUR"))).toBe("12,50 €"));
  it("XOF sans décimales", () => expect(nbsp(formatMoney(3500, "XOF"))).toBe("3 500 F CFA"));
});

describe("parseMoney / moneyInput", () => {
  it("parse les virgules françaises", () => expect(parseMoney("12,5", "EUR")).toBe(1250));
  it("refuse trop de décimales", () => expect(parseMoney("1,234", "EUR")).toBeNull());
  it("XOF entier", () => expect(parseMoney("3 500", "XOF")).toBe(3500));
  it("refuse les décimales XOF", () => expect(parseMoney("10,5", "XOF")).toBeNull());
  it("aller-retour", () => expect(parseMoney(moneyInput(1999, "EUR"), "EUR")).toBe(1999));
  it("refuse le texte", () => expect(parseMoney("abc", "EUR")).toBeNull());
});

describe("formatElapsed", () => {
  const now = new Date("2026-11-05T12:00:00Z").getTime();
  it("secondes", () => expect(formatElapsed("2026-11-05T11:59:30Z", now)).toBe("30 s"));
  it("minutes", () => expect(formatElapsed("2026-11-05T11:53:00Z", now)).toBe("7 min"));
  it("heures", () => expect(formatElapsed("2026-11-05T10:55:00Z", now)).toBe("1 h 05"));
});
