export const LETTERS = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");
export type Point = { x: number; y: number; z: number };
export type Frame = { t: number; landmarks: Point[]; handedness: string };
export type Sample = {
  id: string;
  label: string;
  participant: string;
  session: string;
  createdAt: string;
  frames: Frame[];
  reviewed: false;
  photo?: { dataUrl: string; frameIndex: number };
};
export type Dataset = {
  schemaVersion: 1;
  language: "LENSEGUA";
  samples: Sample[];
};
export function dataset(samples: Sample[]): Dataset {
  return { schemaVersion: 1, language: "LENSEGUA", samples };
}
export function normalize(points: Point[]): number[] {
  if (points.length !== 21) throw new Error("Se requieren 21 puntos");
  const wrist = points[0];
  const centered = points.map((p) => [
    p.x - wrist.x,
    p.y - wrist.y,
    p.z - wrist.z,
  ]);
  const scale = Math.max(...centered.map((p) => Math.hypot(...p)));
  if (!Number.isFinite(scale) || scale < 1e-8) throw new Error("Mano inválida");
  return centered.flatMap((p) => p.map((v) => v / scale));
}
export function downloadDataset(samples: Sample[], includePhotos = false) {
  const exported = includePhotos
    ? samples
    : samples.map(({ photo: _photo, ...sample }) => sample);
  const participants = [...new Set(samples.map((s) => s.participant))];
  const participant =
    participants.length === 1
      ? participants[0].replace(/[^a-zA-Z0-9_-]/g, "_")
      : "grupo";
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(dataset(exported))], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `senalab-${participant}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
