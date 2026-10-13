import { LETTERS, normalize, type Frame } from "./dataset";
type Tree = {
  left: number[];
  right: number[];
  feature: number[];
  threshold: number[];
  values: number[][];
};
export type RecognitionModel = {
  schemaVersion: 1;
  kind: "senalab-random-forest";
  language: "LENSEGUA";
  personal: boolean;
  normalization: string;
  labels: string[];
  trees: Tree[];
};
const NORMALIZATION =
  "wrist-centered/max-euclidean-distance; median per attempt";
export function parseModel(value: unknown): RecognitionModel {
  const m = value as RecognitionModel;
  if (
    !m ||
    m.schemaVersion !== 1 ||
    m.kind !== "senalab-random-forest" ||
    m.language !== "LENSEGUA" ||
    m.normalization !== NORMALIZATION ||
    typeof m.personal !== "boolean" ||
    !Array.isArray(m.labels) ||
    m.labels.length < 2 ||
    m.labels.some((l) => !LETTERS.includes(l)) ||
    new Set(m.labels).size !== m.labels.length ||
    !Array.isArray(m.trees) ||
    !m.trees.length ||
    m.trees.length > 1000
  )
    throw new Error(
      "Modelo incompatible. Usa el model.json generado por training/train.py.",
    );
  for (const tree of m.trees) {
    const n = tree?.left?.length;
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      n > 10000 ||
      ![tree.left, tree.right, tree.feature, tree.threshold, tree.values].every(
        (a) => Array.isArray(a) && a.length === n,
      )
    )
      throw new Error("Árbol inválido");
    for (let i = 0; i < n; i++) {
      const leaf = tree.left[i] === -1 && tree.right[i] === -1;
      if (
        !Number.isFinite(tree.threshold[i]) ||
        !Array.isArray(tree.values[i]) ||
        tree.values[i].length !== m.labels.length ||
        tree.values[i].some((v) => !Number.isFinite(v) || v < 0) ||
        tree.values[i].reduce((a, b) => a + b, 0) <= 0
      )
        throw new Error("Valores del modelo inválidos");
      if (
        !leaf &&
        (!Number.isInteger(tree.feature[i]) ||
          tree.feature[i] < 0 ||
          tree.feature[i] >= 63 ||
          ![tree.left[i], tree.right[i]].every(
            (c) => Number.isInteger(c) && c > i && c < n,
          ))
      )
        throw new Error("Estructura del árbol inválida");
    }
  }
  return m;
}
export function attemptFeatures(frames: Frame[]): number[] {
  if (!frames.length) throw new Error("Intento sin puntos");
  const vectors = frames.map((f) => normalize(f.landmarks));
  return Array.from({ length: 63 }, (_, i) => {
    const sorted = vectors.map((v) => v[i]).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  });
}
export function predictFeatures(
  model: RecognitionModel,
  features: number[],
): number[] {
  if (features.length !== 63 || features.some((v) => !Number.isFinite(v)))
    throw new Error("Puntos inválidos");
  const scores = model.labels.map(() => 0);
  for (const tree of model.trees) {
    let node = 0;
    while (tree.left[node] !== -1)
      node =
        Math.fround(features[tree.feature[node]]) <= tree.threshold[node]
          ? tree.left[node]
          : tree.right[node];
    const sum = tree.values[node].reduce((a, b) => a + b, 0);
    tree.values[node].forEach((v, i) => {
      scores[i] += v / sum / model.trees.length;
    });
  }
  return scores;
}
export function recognize(model: RecognitionModel, frames: Frame[]): string {
  const scores = predictFeatures(model, attemptFeatures(frames));
  return model.labels[scores.indexOf(Math.max(...scores))];
}
