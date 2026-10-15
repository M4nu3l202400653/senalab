import { expect, it } from "vitest";
import {
  parseModel,
  predictFeatures,
  attemptFeatures,
  recognizeForPractice,
} from "./recognizer";
const model = {
  schemaVersion: 1,
  kind: "senalab-random-forest",
  language: "LENSEGUA",
  personal: true,
  normalization: "wrist-centered/max-euclidean-distance; median per attempt",
  labels: ["A", "B"],
  trees: [
    {
      left: [1, -1, -1],
      right: [2, -1, -1],
      feature: [0, -2, -2],
      threshold: [0, -2, -2],
      values: [
        [1, 1],
        [3, 1],
        [1, 3],
      ],
    },
  ],
};
it("usa las probabilidades normalizadas de las hojas del bosque", () => {
  const m = parseModel(model);
  const values = Array(63).fill(0);
  expect(predictFeatures(m, values)).toEqual([0.75, 0.25]);
  values[0] = 1;
  expect(predictFeatures(m, values)).toEqual([0.25, 0.75]);
});
it("rechaza árboles con ciclos y esquemas incompatibles", () => {
  expect(() => parseModel({ ...model, kind: "other" })).toThrow();
  expect(() =>
    parseModel({ ...model, trees: [{ ...model.trees[0], left: [0, -1, -1] }] }),
  ).toThrow();
});
it("calcula la mediana de un intento de longitud par", () => {
  const landmarks = Array.from({ length: 21 }, (_, i) => ({
    x: i / 30,
    y: i / 40,
    z: i / 80,
  }));
  const f = { t: 0, handedness: "Right", landmarks };
  expect(attemptFeatures([f, f])).toEqual(attemptFeatures([f]));
  expect(() => attemptFeatures([])).toThrow();
});

it("compara con float32 como scikit-learn cerca de un umbral", () => {
  const m = parseModel({
    ...model,
    trees: [{ ...model.trees[0], threshold: [1, -2, -2] }],
  });
  const values = Array(63).fill(0);
  values[0] = 1 + 1e-9;
  expect(predictFeatures(m, values)).toEqual([0.75, 0.25]);
});

it("la práctica rechaza una respuesta ambigua y acepta una decisión con suficiente apoyo", () => {
  const frames = [
    {
      t: 0,
      handedness: "Right",
      landmarks: Array.from({ length: 21 }, (_, i) => ({
        x: i / 30,
        y: i / 40,
        z: i / 80,
      })),
    },
  ];
  const leaf = (values: number[]) =>
    parseModel({
      ...model,
      trees: [
        {
          left: [-1],
          right: [-1],
          feature: [-2],
          threshold: [-2],
          values: [values],
        },
      ],
    });
  expect(recognizeForPractice(leaf([0.5, 0.5]), frames)).toBeNull();
  expect(recognizeForPractice(leaf([0.6, 0.4]), frames)).toBeNull();
  expect(recognizeForPractice(leaf([0.8, 0.2]), frames)).toBe("A");
});
