import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import {
  LETTERS,
  downloadDataset,
  type Frame,
  type Sample,
} from "./lib/dataset";
import { deleteSample, loadSamples, saveSample } from "./lib/storage";
import { parseModel, recognize, type RecognitionModel } from "./lib/recognizer";
import { REFERENCE_CROPS } from "./lib/references";
import "./App.css";

type Tab = "practice" | "recognition" | "dataset" | "roadmap";
const phases = [
  [
    "01",
    "Fundamentos y referencias",
    "Definir el alfabeto de LENSEGUA, documentar fuentes y validar cada seña con una persona competente.",
    "En curso",
  ],
  [
    "02",
    "Web y captura de muestras",
    "Cámara, puntos de la mano, intentos etiquetados y exportación para Python.",
    "Base implementada",
  ],
  [
    "03",
    "Entrenamiento y evaluación",
    "Comparar modelos para letras estáticas y evaluar con participantes que no aparezcan en entrenamiento.",
    "Próxima fase",
  ],
  [
    "04",
    "Práctica con reconocimiento",
    "Integrar el modelo, umbral de aceptación y resultados por intento.",
    "Pendiente",
  ],
  [
    "05",
    "Alfabeto y movimientos",
    "Incorporar secuencias, ampliar el vocabulario y mejorar con pruebas de uso.",
    "Pendiente",
  ],
];
function App() {
  const [tab, setTab] = useState<Tab>("practice");
  const [letter, setLetter] = useState("A");
  const [participant, setParticipant] = useState("");
  const [session, setSession] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [consent, setConsent] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [status, setStatus] = useState("Cámara apagada");
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recognizer, setRecognizer] = useState<RecognitionModel | null>(null);
  const [prediction, setPrediction] = useState("");
  const testing = useRef(false);
  const [remaining, setRemaining] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const model = useRef<HandLandmarker | null>(null);
  const animation = useRef(0);
  const generation = useRef(0);
  const frames = useRef<Frame[] | null>(null);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadSamples()
      .then((s) => {
        if (mounted.current) {
          setSamples(s);
          setStorageReady(true);
        }
      })
      .catch(() => {
        if (mounted.current)
          setError(
            "No se pudo abrir el almacenamiento. Habilita los datos del sitio para guardar muestras.",
          );
      });
    return () => {
      mounted.current = false;
      generation.current++;
      cancelAnimationFrame(animation.current);
      if (timer.current) clearTimeout(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      model.current?.close();
    };
  }, []);

  function stopCamera() {
    generation.current++;
    cancelAnimationFrame(animation.current);
    if (timer.current) clearTimeout(timer.current);
    frames.current = null;
    setPrediction("");
    setRecording(false);
    setRemaining(0);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    model.current?.close();
    model.current = null;
    if (video.current) video.current.srcObject = null;
    canvas.current?.getContext("2d")?.clearRect(0, 0, 960, 720);
    setActive(false);
    setLoading(false);
    setDetected(false);
    setStatus("Cámara apagada");
  }
  async function startCamera() {
    if (loading || active) return;
    const run = ++generation.current;
    setLoading(true);
    setError("");
    setStatus("Preparando cámara y detector…");
    let pendingStream: MediaStream | null = null;
    let pendingModel: HandLandmarker | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("La cámara requiere localhost o una conexión HTTPS.");
      pendingStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 960, height: 720 },
        audio: false,
      });
      const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      pendingModel = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      if (run !== generation.current || !mounted.current) {
        pendingStream.getTracks().forEach((t) => t.stop());
        pendingModel.close();
        return;
      }
      stream.current = pendingStream;
      model.current = pendingModel;
      video.current!.srcObject = pendingStream;
      await video.current!.play();
      if (run !== generation.current || !mounted.current) return;
      setActive(true);
      setLoading(false);
      let lastTime = -1,
        lastDetection = 0;
      const tick = () => {
        if (run !== generation.current || !video.current || !model.current)
          return;
        try {
          const now = performance.now();
          if (
            video.current.readyState >= 2 &&
            video.current.currentTime !== lastTime &&
            now - lastDetection >= 80
          ) {
            lastTime = video.current.currentTime;
            lastDetection = now;
            const result = model.current.detectForVideo(video.current, now);
            const ctx = canvas.current?.getContext("2d");
            if (ctx && canvas.current) {
              canvas.current.width = video.current.videoWidth;
              canvas.current.height = video.current.videoHeight;
              ctx.clearRect(0, 0, canvas.current.width, canvas.current.height);
              const drawing = new DrawingUtils(ctx);
              result.landmarks.forEach((points) => {
                drawing.drawConnectors(
                  points,
                  HandLandmarker.HAND_CONNECTIONS,
                  { color: "#68efc6", lineWidth: 3 },
                );
                drawing.drawLandmarks(points, { color: "#fff", radius: 3 });
              });
            }
            const valid = result.landmarks.length === 1;
            setDetected(valid);
            setStatus(
              valid
                ? "Una mano detectada · lista para capturar"
                : result.landmarks.length > 1
                  ? "Muestra una sola mano para esta captura"
                  : "Coloca tu mano dentro del encuadre",
            );
            if (frames.current && valid)
              frames.current.push({
                t: Math.round(now - started.current),
                landmarks: result.landmarks[0].map((p) => ({
                  x: p.x,
                  y: p.y,
                  z: p.z,
                })),
                handedness:
                  result.handedness[0]?.[0]?.categoryName ?? "Unknown",
              });
            if (frames.current)
              setRemaining(
                Math.max(0, Math.ceil((3000 - (now - started.current)) / 1000)),
              );
          }
          animation.current = requestAnimationFrame(tick);
        } catch {
          stopCamera();
          setError(
            "El detector se detuvo. Intenta activar la cámara nuevamente.",
          );
        }
      };
      tick();
    } catch (e) {
      pendingStream?.getTracks().forEach((t) => t.stop());
      pendingModel?.close();
      if (run === generation.current && mounted.current) {
        stream.current = null;
        model.current = null;
        setActive(false);
        setLoading(false);
        setStatus("Cámara no disponible");
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Permite el acceso a la cámara en tu navegador y vuelve a intentarlo."
            : e instanceof Error
              ? e.message
              : "No se pudo iniciar la cámara.",
        );
      }
    }
  }
  async function finishCapture(label: string, person: string, visit: string) {
    const captured = frames.current ?? [];
    frames.current = null;
    setRemaining(0);
    if (
      captured.length < 20 ||
      captured[captured.length - 1].t - captured[0].t < 2000
    ) {
      setRecording(false);
      setError(
        "Captura incompleta: mantén una sola mano visible durante al menos dos segundos y vuelve a intentarlo.",
      );
      return;
    }
    if (testing.current) {
      try {
        if (!recognizer) throw new Error("Carga un modelo primero.");
        setPrediction(recognize(recognizer, captured));
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo evaluar el intento.",
        );
      } finally {
        setRecording(false);
      }
      return;
    }
    const sample: Sample = {
      id: crypto.randomUUID(),
      label,
      participant: person,
      session: visit,
      createdAt: new Date().toISOString(),
      frames: captured,
      reviewed: false,
    };
    try {
      await saveSample(sample);
      if (mounted.current) {
        setSamples((s) => [...s, sample]);
        setStatus(`Intento de ${label} guardado · pendiente de revisión`);
      }
    } catch {
      if (mounted.current)
        setError(
          "No se pudo guardar el intento. Revisa el espacio disponible y vuelve a capturar.",
        );
    } finally {
      if (mounted.current) setRecording(false);
    }
  }
  function capture() {
    if (
      !active ||
      !detected ||
      recording ||
      !storageReady ||
      !consent ||
      !participant.trim() ||
      !session.trim()
    )
      return;
    setError("");
    testing.current = false;
    setPrediction("");
    frames.current = [];
    started.current = performance.now();
    setRemaining(3);
    setRecording(true);
    timer.current = setTimeout(() => {
      void finishCapture(letter, participant.trim(), session.trim());
    }, 3000);
  }
  function testRecognition() {
    if (!active || !detected || recording || !recognizer) return;
    setError("");
    setPrediction("");
    testing.current = true;
    frames.current = [];
    started.current = performance.now();
    setRemaining(3);
    setRecording(true);
    timer.current = setTimeout(() => {
      void finishCapture("", "", "");
    }, 3000);
  }
  async function loadRecognitionModel(file: File) {
    setError("");
    setPrediction("");
    setRecognizer(null);
    try {
      if (file.size > 5_000_000)
        throw new Error("El modelo debe pesar menos de 5 MB.");
      const loaded = parseModel(JSON.parse(await file.text()));
      if (mounted.current) setRecognizer(loaded);
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar el modelo.",
        );
    }
  }
  function changeTab(next: Tab) {
    stopCamera();
    setTab(next);
    setError("");
  }
  async function removeSample(id: string) {
    try {
      await deleteSample(id);
      setSamples((s) => s.filter((sample) => sample.id !== id));
    } catch {
      setError("No se pudo eliminar la muestra.");
    }
  }
  const crop = REFERENCE_CROPS[letter]?.split(" ").map(Number);
  const letterCount = samples.filter((s) => s.label === letter).length;
  return (
    <div className="app">
      <header className="header">
        <img className="logo" src="/logo-senalab.jpeg" alt="SeñaLab" />
        <div>
          <h1>SeñaLab</h1>
          <p>Prototipo · Alfabeto de LENSEGUA</p>
        </div>
      </header>
      <nav aria-label="Navegación principal">
        <button
          aria-pressed={tab === "practice"}
          onClick={() => changeTab("practice")}
        >
          Capturar muestras
        </button>
        <button
          aria-pressed={tab === "recognition"}
          onClick={() => changeTab("recognition")}
        >
          Reconocimiento
        </button>
        <button
          aria-pressed={tab === "dataset"}
          onClick={() => changeTab("dataset")}
        >
          Mis muestras ({samples.length})
        </button>
        <button
          aria-pressed={tab === "roadmap"}
          onClick={() => changeTab("roadmap")}
        >
          Fases del proyecto
        </button>
      </nav>
      <main>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Cerrar mensaje">
              ×
            </button>
          </div>
        )}
        {(tab === "practice" || tab === "recognition") && (
          <>
            <h2>
              {tab === "practice" ? "Capturar muestras" : "Reconocimiento"}
            </h2>
            <p className="notice">
              {tab === "practice"
                ? "Guarda intentos etiquetados para entrenar el modelo."
                : "Carga tu modelo, activa la cámara y prueba una seña durante 3 segundos. El intento no se guarda."}
            </p>
            <div className="workspace">
              {tab === "practice" ? (
                <section className="panel">
                  <label className="letter-select">
                    Letra
                    <select
                      aria-label="Letra"
                      value={letter}
                      disabled={recording}
                      onChange={(e) => {
                        setLetter(e.target.value);
                      }}
                    >
                      {LETTERS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    {letterCount} intentos guardados para {letter}.
                  </p>
                  <div className="reference">
                    <h3>Referencia: {letter}</h3>
                    {crop ? (
                      <svg
                        className="reference-crop"
                        viewBox={REFERENCE_CROPS[letter]}
                        role="img"
                        aria-label={`Referencia de la letra ${letter} de la lámina del equipo`}
                      >
                        <defs>
                          <clipPath id="reference-clip">
                            <rect
                              x={crop[0]}
                              y={crop[1]}
                              width={crop[2]}
                              height={crop[3]}
                            />
                          </clipPath>
                        </defs>
                        <image
                          clipPath="url(#reference-clip)"
                          href="/alfabeto-referencia.jpeg"
                          width="460"
                          height="667"
                        />
                      </svg>
                    ) : (
                      <p>La lámina no incluye la letra {letter}.</p>
                    )}
                    <p className="help">
                      Lámina proporcionada por el equipo, pendiente de
                      validación para LENSEGUA. Las imágenes fijas no muestran
                      movimientos.
                    </p>
                  </div>
                  <a
                    href="https://conadi.gob.gt/web/lensegua/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Recursos de CONADI
                  </a>
                  <label>
                    Código de participante
                    <input
                      value={participant}
                      disabled={recording}
                      onChange={(e) => setParticipant(e.target.value)}
                      placeholder="persona-01"
                      maxLength={60}
                    />
                  </label>
                  <label>
                    Sesión
                    <input
                      value={session}
                      disabled={recording}
                      onChange={(e) => setSession(e.target.value)}
                      maxLength={60}
                    />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={recording}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    Acepto guardar los puntos de mi mano en este navegador. No
                    se guardan imágenes ni audio.
                  </label>
                </section>
              ) : (
                <section className="panel">
                  <h3>Modelo</h3>
                  <p className="help">
                    Para la prueba personal A–F, selecciona el archivo
                    senalab-modelo-personal-af.json de Descargas.
                  </p>
                  <div className="recognition">
                    <label>
                      Modelo de reconocimiento (.json)
                      <input
                        type="file"
                        accept=".json,application/json"
                        disabled={recording}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void loadRecognitionModel(file);
                        }}
                      />
                    </label>
                    {recognizer && (
                      <>
                        <p>Modelo cargado: {recognizer.labels.join(", ")}.</p>
                        <p className="help">
                          {recognizer.personal
                            ? "Demostración personal, sin medición de precisión."
                            : "Reconocimiento experimental."}{" "}
                          El resultado elige entre las letras del modelo; no
                          valida si la seña está bien realizada ni descarta
                          gestos ajenos al catálogo.
                        </p>
                      </>
                    )}
                    {prediction && (
                      <p className="notice" role="status">
                        Letra candidata: <strong>{prediction}</strong>.
                        Resultado experimental.
                      </p>
                    )}
                  </div>
                </section>
              )}
              <section className="panel">
                <h3>Cámara</h3>
                <div className="camera-view">
                  <video
                    ref={video}
                    muted
                    playsInline
                    aria-label="Vista de tu cámara"
                  />
                  <canvas ref={canvas} aria-hidden="true" />
                  {!active && (
                    <span className="camera-placeholder">
                      {loading ? "Preparando detector…" : "Cámara apagada"}
                    </span>
                  )}
                  {recording && (
                    <span className="recording">
                      {testing.current
                        ? "Probando reconocimiento"
                        : `Capturando ${letter}`}{" "}
                      · {remaining}s
                    </span>
                  )}
                </div>
                <p role="status">{status}</p>
                <div className="actions">
                  {active || loading ? (
                    <button disabled={recording} onClick={stopCamera}>
                      Apagar cámara
                    </button>
                  ) : (
                    <button onClick={() => void startCamera()}>
                      Activar cámara
                    </button>
                  )}
                  {tab === "practice" ? (
                    <button
                      className="primary"
                      onClick={capture}
                      disabled={
                        !active ||
                        !detected ||
                        recording ||
                        !participant.trim() ||
                        !session.trim() ||
                        !consent ||
                        !storageReady
                      }
                    >
                      {recording
                        ? "Guardando intento…"
                        : `Capturar letra ${letter}`}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={
                        !recognizer || !active || !detected || recording
                      }
                      onClick={testRecognition}
                    >
                      {recording ? "Probando…" : "Probar reconocimiento (3 s)"}
                    </button>
                  )}
                </div>
                <p className="help">
                  Cada intento dura 3 segundos. Mantén una sola mano visible y
                  usa buena iluminación.
                </p>
              </section>
            </div>
          </>
        )}
        {tab === "dataset" && (
          <>
            <h2>Mis muestras</h2>
            <p>{samples.length} intentos guardados en esta computadora.</p>
            <p className="notice">
              Muestras pendientes de revisión. Exporta un respaldo antes de
              borrar los datos del navegador.
            </p>
            <button
              className="primary"
              disabled={!samples.length}
              onClick={() => downloadDataset(samples)}
            >
              Exportar JSON
            </button>
            {samples.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Letra</th>
                      <th>Participante</th>
                      <th>Sesión</th>
                      <th>Cuadros</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...samples].reverse().map((s) => (
                      <tr key={s.id}>
                        <td>{s.label}</td>
                        <td>{s.participant}</td>
                        <td>{s.session}</td>
                        <td>{s.frames.length}</td>
                        <td>
                          <button onClick={() => void removeSample(s.id)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No hay muestras. Puedes empezar en «Capturar muestras».</p>
            )}
          </>
        )}
        {tab === "roadmap" && (
          <>
            <h2>Fases del proyecto</h2>
            <ol className="phases">
              {phases.map(([n, title, description, state]) => (
                <li key={n}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <small>{state}</small>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}
export default App;
