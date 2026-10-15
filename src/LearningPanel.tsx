import { LetterReference } from "./LetterReference";
import { REFERENCE_CROPS } from "./lib/references";
import type { PracticeAttempt } from "./lib/learning";
export function LearningPanel({
  letter,
  supported,
  busy,
  history,
  result,
  onSelect,
  onNext,
}: {
  letter: string;
  supported: string[];
  busy: boolean;
  history: PracticeAttempt[];
  result: PracticeAttempt | null;
  onSelect: (letter: string) => void;
  onNext: () => void;
}) {
  const available = supported.filter((l) => REFERENCE_CROPS[l]);
  const matches = new Set(
    history
      .filter((h) => h.outcome === "match" && available.includes(h.target))
      .map((h) => h.target),
  );
  const attempts = history.filter((h) => h.target === letter);
  const matchingAttempts = attempts.filter((h) => h.outcome === "match").length;
  return (
    <section className="panel learning-panel">
      <h3>Observa y practica</h3>
      <label>
        Letra de práctica
        <select
          value={letter}
          disabled={busy}
          onChange={(e) => onSelect(e.target.value)}
        >
          {Object.keys(REFERENCE_CROPS).map((l) => (
            <option key={l} value={l}>
              {l}
              {supported.includes(l) ? "" : " · solo referencia"}
            </option>
          ))}
        </select>
      </label>
      <LetterReference letter={letter} />
      <ol>
        <li>Observa la posición de la mano en la referencia.</li>
        <li>Activa la cámara y realiza la seña de {letter}.</li>
        <li>
          Pulsa «Practicar letra {letter}» y mantén la seña durante tres
          segundos.
        </li>
      </ol>
      {!supported.includes(letter) && (
        <p className="notice">
          El modelo actual no incluye {letter}. Puedes consultar la referencia;
          para evaluarla se necesitan muestras y un modelo que la reconozca.
        </p>
      )}
      {result && (
        <div
          className={`notice learning-result ${result.outcome}`}
          role="status"
        >
          {result.outcome === "match" ? (
            <p>
              El modelo reconoció <strong>{result.candidate}</strong>. Coincide
              con la letra del ejercicio.
            </p>
          ) : result.outcome === "different" ? (
            <p>
              El modelo reconoció <strong>{result.candidate}</strong>. Estamos
              practicando <strong>{result.target}</strong>; observa la
              referencia y vuelve a intentarlo.
            </p>
          ) : (
            <p>
              No hubo una coincidencia clara. Vuelve a intentarlo con la mano
              completa en el encuadre y buena iluminación.
            </p>
          )}
        </div>
      )}
      <button disabled={busy || !available.length} onClick={onNext}>
        Siguiente letra
      </button>
      <h3 className="progress-title">Tu práctica</h3>
      <p>
        {attempts.length} {attempts.length === 1 ? "intento" : "intentos"} de{" "}
        {letter} · {matchingAttempts}{" "}
        {matchingAttempts === 1 ? "coincidencia" : "coincidencias"}.
      </p>
      <p>
        {matches.size} de {available.length} letras del modelo con al menos una
        coincidencia.
      </p>
      <p className="help">
        Las referencias siguen pendientes de validación para LENSEGUA. Las
        coincidencias son resultados experimentales del modelo, no una
        certificación de ejecución correcta. La práctica no añade muestras al
        entrenamiento.
      </p>
    </section>
  );
}
