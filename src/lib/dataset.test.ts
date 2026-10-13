import { describe, expect, it } from "vitest";
import { dataset, normalize, type Point } from "./dataset";
const points: Point[] = Array.from({ length: 21 }, (_, i) => ({
  x: i / 30,
  y: i / 40,
  z: i / 80,
}));
describe("dataset de entrenamiento", () => {
  it("normaliza sin perder la orientación y es invariante a escala y traslación", () => {
    const shifted = points.map((p) => ({
      x: p.x * 2 + 4,
      y: p.y * 2 - 3,
      z: p.z * 2 + 1,
    }));
    normalize(points).forEach((value, i) =>
      expect(normalize(shifted)[i]).toBeCloseTo(value),
    );
    expect(normalize(points)).toHaveLength(63);
  });
  it("rechaza manos degeneradas o incompletas", () => {
    expect(() => normalize([])).toThrow();
    expect(() => normalize(Array(21).fill({ x: 0, y: 0, z: 0 }))).toThrow();
  });
  it("identifica la lengua y versión al exportar", () => {
    expect(dataset([])).toEqual({
      schemaVersion: 1,
      language: "LENSEGUA",
      samples: [],
    });
  });
});
