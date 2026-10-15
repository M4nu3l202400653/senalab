import { parseModel, type RecognitionModel } from "./recognizer";
function profileToken(): string {
  let token = localStorage.getItem("senalab-profile");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("senalab-profile", token);
  }
  return token;
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        "X-Profile-Token": profileToken(),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "No se pudo conectar al servidor. Espera unos momentos y vuelve a intentarlo.",
    );
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(
      "El servidor no está disponible. Espera unos momentos y recarga.",
    );
  }
  if (!response.ok)
    throw new Error(value.error || "No se pudo completar la operación");
  return value as T;
}
export type ModelState = {
  source: "initial" | "personal" | null;
  model: RecognitionModel | null;
  attempts?: number;
};
export async function modelRequest(
  method = "GET",
  path = "/model",
): Promise<ModelState> {
  const value = await request<ModelState>(path, method);
  return { ...value, model: value.model ? parseModel(value.model) : null };
}
