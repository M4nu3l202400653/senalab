import type { Sample } from "./dataset";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("senalab", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("samples", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("samples", mode);
    const request = action(tx.objectStore("samples"));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export const loadSamples = () =>
  transact("readonly", (store) => store.getAll()) as Promise<Sample[]>;
export const saveSample = (sample: Sample) =>
  transact("readwrite", (store) => store.add(sample));
export const deleteSample = (id: string) =>
  transact("readwrite", (store) => store.delete(id));
