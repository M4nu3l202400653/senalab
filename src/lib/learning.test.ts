import { expect, it } from "vitest";
import { practiceOutcome } from "./learning";
it("distingue coincidencia, otra letra y falta de decisión", () => {
  expect(practiceOutcome("A", "A")).toBe("match");
  expect(practiceOutcome("A", "B")).toBe("different");
  expect(practiceOutcome("A", null)).toBe("uncertain");
});
