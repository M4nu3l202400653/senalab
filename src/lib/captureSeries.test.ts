import { expect, it, vi } from "vitest";
import { runCaptureSeries, waitFor } from "./captureSeries";
it("hace cinco capturas separadas por cuatro pausas", async () => {
  const order: string[] = [];
  const signal = new AbortController().signal;
  const count = await runCaptureSeries({
    signal,
    capture: async (n) => {
      order.push(`capture-${n}`);
      return true;
    },
    rest: async (n) => {
      order.push(`rest-${n}`);
    },
  });
  expect(count).toBe(5);
  expect(order).toEqual([
    "capture-1",
    "rest-2",
    "capture-2",
    "rest-3",
    "capture-3",
    "rest-4",
    "capture-4",
    "rest-5",
    "capture-5",
  ]);
});
it("interrumpe una serie si un intento no es válido", async () => {
  const capture = vi.fn(async (n) => n < 3);
  const count = await runCaptureSeries({
    signal: new AbortController().signal,
    capture,
    rest: async () => {},
  });
  expect(count).toBe(2);
  expect(capture).toHaveBeenCalledTimes(3);
});
it("cancelar durante una pausa impide otra captura", async () => {
  const controller = new AbortController();
  const capture = vi.fn(async () => true);
  const count = await runCaptureSeries({
    signal: controller.signal,
    capture,
    rest: async () => {
      controller.abort();
    },
  });
  expect(count).toBe(1);
  expect(capture).toHaveBeenCalledTimes(1);
});
it("el temporizador de una captura se cancela sin esperar su vencimiento", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const promise = waitFor(3000, controller.signal);
  const assertion = expect(promise).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
