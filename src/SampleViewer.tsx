import { useEffect, useState } from "react";
import { HandLandmarker } from "@mediapipe/tasks-vision";
import type { Sample } from "./lib/dataset";
export function SampleViewer({
  sample,
  onClose,
}: {
  sample: Sample;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(sample.photo?.frameIndex ?? 0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let animation = 0;
    const start = performance.now();
    const first = sample.frames[0].t;
    const tick = () => {
      const elapsed = performance.now() - start;
      let next = 0;
      while (
        next + 1 < sample.frames.length &&
        sample.frames[next + 1].t - first <= elapsed
      )
        next++;
      setIndex(next);
      if (next === sample.frames.length - 1) setPlaying(false);
      else animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, sample]);
  const frame = sample.frames[index];
  const photo =
    sample.photo?.frameIndex === index ? sample.photo.dataUrl : null;
  return (
    <section
      className="sample-viewer"
      aria-label={`Visor de muestra ${sample.label}`}
    >
      <div className="actions">
        <h3>Intento de {sample.label}</h3>
        <button onClick={onClose}>Cerrar visor</button>
      </div>
      <p className="help">
        {sample.participant} · {sample.session}.{" "}
        {sample.photo
          ? "Hay una foto del intento: vuelve a su cuadro para verla."
          : "Este intento solo contiene puntos; no se guardó una fotografía."}
      </p>
      <svg
        viewBox="0 0 1000 750"
        className="sample-points"
        role="img"
        aria-label={
          photo
            ? "Foto guardada con los puntos detectados"
            : "Posiciones guardadas de la mano"
        }
      >
        <g transform="translate(1000 0) scale(-1 1)">
          {photo && (
            <image
              href={photo}
              width="1000"
              height="750"
              preserveAspectRatio="none"
            />
          )}
          {HandLandmarker.HAND_CONNECTIONS.map(({ start, end }, i) => (
            <line
              key={i}
              x1={frame.landmarks[start].x * 1000}
              y1={frame.landmarks[start].y * 750}
              x2={frame.landmarks[end].x * 1000}
              y2={frame.landmarks[end].y * 750}
              stroke="#009b7a"
              strokeWidth="5"
            />
          ))}
          {frame.landmarks.map((p, i) => (
            <circle
              key={i}
              cx={p.x * 1000}
              cy={p.y * 750}
              r="7"
              fill="#fff"
              stroke="#003e2f"
              strokeWidth="3"
            />
          ))}
        </g>
      </svg>
      <label>
        Cuadro {index + 1} de {sample.frames.length} ·{" "}
        {(frame.t / 1000).toFixed(2)} s
        <input
          type="range"
          min="0"
          max={sample.frames.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
      </label>
      <div className="actions">
        <button
          onClick={() => {
            if (playing) setPlaying(false);
            else {
              setIndex(0);
              setPlaying(true);
            }
          }}
        >
          {playing ? "Pausar" : "Reproducir puntos"}
        </button>
        {sample.photo && (
          <button
            onClick={() => {
              setPlaying(false);
              setIndex(sample.photo!.frameIndex);
            }}
          >
            Ver foto del intento
          </button>
        )}
      </div>
      <p className="help">
        Vista espejo, igual que la cámara. La foto sirve para revisar; el modelo
        sigue entrenándose solo con puntos. Si detectas una captura incorrecta,
        elimínala y vuelve a capturar. Después reentrena.
      </p>
    </section>
  );
}
