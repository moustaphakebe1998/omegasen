import { describe, expect, it } from "vitest";

import { buildLine, lineUnitPrice, type Product, validateOptions } from "@/lib/cart";

const product = {
  id: "p1",
  name: "Yassa",
  effective_price: 3500,
  image_thumb_url: null,
  option_groups: [
    {
      id: "g1",
      name: "Accompagnement",
      min_choices: 1,
      max_choices: 1,
      options: [
        { id: "riz", name: "Riz", price_delta: 0, is_available: true },
        { id: "frites", name: "Frites", price_delta: 500, is_available: true },
      ],
    },
    {
      id: "g2",
      name: "Suppléments",
      min_choices: 0,
      max_choices: 2,
      options: [
        { id: "a", name: "A", price_delta: 100, is_available: true },
        { id: "b", name: "B", price_delta: 200, is_available: true },
        { id: "c", name: "C", price_delta: 300, is_available: true },
      ],
    },
  ],
} as unknown as Product;

describe("validateOptions", () => {
  it("exige les groupes obligatoires", () => expect(validateOptions(product, [])).toMatch(/Accompagnement/));
  it("limite le maximum", () => expect(validateOptions(product, ["riz", "a", "b", "c"])).toMatch(/maximum/));
  it("accepte une sélection valide", () => expect(validateOptions(product, ["frites", "a"])).toBeNull());
});

describe("buildLine", () => {
  it("calcule le prix unitaire avec suppléments", () => {
    const line = buildLine(product, ["frites", "b"], 2, " sans sel ");
    expect(lineUnitPrice(line)).toBe(4200);
    expect(line.optionLabels).toEqual(["Frites", "B"]);
    expect(line.note).toBe("sans sel");
  });
  it("la clé ne dépend pas de l'ordre des options", () => {
    expect(buildLine(product, ["frites", "b"], 1, "").key).toBe(buildLine(product, ["b", "frites"], 1, "").key);
  });
});
