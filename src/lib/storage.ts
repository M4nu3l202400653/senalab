import type { Sample } from "./dataset";
import { request } from "./api";
import { loadSamples as loadLegacySamples } from "./legacyStorage";
export async function loadSamples(): Promise<Sample[]> {
  // Copiar una sola vez los datos de la versión anterior, conservando el original.
  // INSERT OR IGNORE hace que los montajes dobles de React no dupliquen intentos.
  await request<Sample[]>("/samples");
  if (!localStorage.getItem("senalab-server-migrated")) {
    const legacy = await loadLegacySamples();
    for (let start = 0; start < legacy.length; start += 50) {
      await request("/samples", "POST", legacy.slice(start, start + 50));
    }
    localStorage.setItem("senalab-server-migrated", "1");
  }
  return request<Sample[]>("/samples");
}
export const saveSample = (sample: Sample) =>
  request("/samples", "POST", [sample]);
export const deleteSample = (id: string) => request(`/samples/${id}`, "DELETE");

export const importDataset = (value: unknown) =>
  request<{ added: number; duplicates: number }>(
    "/samples/import",
    "POST",
    value,
  );
