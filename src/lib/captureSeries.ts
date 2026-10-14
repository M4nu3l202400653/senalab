export type SeriesProgress = {
  attempt: number;
  total: number;
  phase: "capture" | "rest";
};
export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Serie cancelada", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export async function runCaptureSeries(options: {
  signal: AbortSignal;
  capture: (attempt: number) => Promise<boolean>;
  rest: (attempt: number) => Promise<void>;
  total?: number;
}): Promise<number> {
  let saved = 0;
  const total = options.total ?? 5;
  for (let attempt = 1; attempt <= total; attempt++) {
    if (options.signal.aborted) break;
    if (attempt > 1) await options.rest(attempt);
    if (options.signal.aborted) break;
    if (!(await options.capture(attempt))) break;
    saved++;
  }
  return saved;
}
