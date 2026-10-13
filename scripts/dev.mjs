import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const localPython =
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python";
const python =
  process.env.SENALAB_PYTHON ||
  (existsSync(localPython) ? localPython : "python3");
const port = process.env.SENALAB_API_PORT || "8000";
const api = spawn(python, ["-m", "server.app", "--port", port], {
  stdio: "inherit",
});
let web;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill("SIGTERM");
  web?.kill("SIGTERM");
  process.exitCode = code;
}
api.on("error", (error) => {
  console.error("No se pudo iniciar Python:", error.message);
  stop(1);
});
api.on("exit", (code) => {
  if (!stopping) stop(code || 1);
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
// Esperar a que el servidor esté disponible antes de abrir la web.
for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (response.ok) {
      if (stopping) break;
      web = spawn(
        process.execPath,
        [
          "node_modules/vite/bin/vite.js",
          "--host",
          "127.0.0.1",
          "--strictPort",
          ...process.argv.slice(2),
        ],
        { stdio: "inherit" },
      );
      web.on("error", (error) => {
        console.error(error.message);
        stop(1);
      });
      web.on("exit", (code) => {
        if (!stopping) stop(code || 0);
      });
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!web && !stopping) {
  console.error(
    "El servidor no respondió. Revisa el entorno Python y sus dependencias.",
  );
  stop(1);
}
