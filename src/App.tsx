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
import "./App.css";

type Tab = "practice" | "dataset" | "roadmap";
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
  const [remaining, setRemaining] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
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
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function stopCamera() {
    generation.current++;
    cancelAnimationFrame(animation.current);
    if (timer.current) clearTimeout(timer.current);
    frames.current = null;
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
    frames.current = [];
    started.current = performance.now();
    setRemaining(3);
    setRecording(true);
    timer.current = setTimeout(() => {
      void finishCapture(letter, participant.trim(), session.trim());
    }, 3000);
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
  const letterCount = samples.filter((s) => s.label === letter).length;
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeTab("practice");
          }}
        >
          <span className="brand-icon">S</span>SeñaLab
          <span className="brand-dot">.</span>
        </a>
        <p className="sidebar-caption">APRENDE. PRACTICA. CONECTA.</p>
        <nav aria-label="Navegación principal">
          <button
            className={tab === "practice" ? "nav active" : "nav"}
            onClick={() => changeTab("practice")}
          >
            <span>◉</span> Laboratorio del alfabeto
          </button>
          <button
            className={tab === "dataset" ? "nav active" : "nav"}
            onClick={() => changeTab("dataset")}
          >
            <span>▦</span> Mis muestras <b>{samples.length}</b>
          </button>
          <button
            className={tab === "roadmap" ? "nav active" : "nav"}
            onClick={() => changeTab("roadmap")}
          >
            <span>↗</span> Ruta del proyecto
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="pill">LENSEGUA</span>
          <p>Lengua de Señas de Guatemala</p>
          <small>Prototipo 0.1 · Datos en tu dispositivo</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>Tu espacio para aprender</span>
          <span className="version">
            FASE 02 <i /> Laboratorio de captura
          </span>
        </header>
        <div className="content">
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Cerrar mensaje">
                ×
              </button>
            </div>
          )}
          {tab === "practice" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    DEL PRIMER GESTO AL PRIMER APRENDIZAJE
                  </p>
                  <h1>Todo empieza con una letra.</h1>
                  <p>
                    Prepara las muestras que darán vida al reconocimiento de
                    LENSEGUA.
                  </p>
                </div>
                <span className="pill">Alfabeto · versión inicial</span>
              </div>
              <div className="notice">
                <span>ⓘ</span>
                <p>
                  <strong>Estamos preparando el modelo.</strong> Este
                  laboratorio detecta tu mano y guarda intentos. La evaluación
                  de letras estará disponible después del entrenamiento y la
                  validación.
                </p>
              </div>
              <div className="workspace">
                <section className="reference card">
                  <div className="section-label">
                    <span>01 / ELIGE UNA LETRA</span>
                    <span>{letterCount} intentos</span>
                  </div>
                  <div className="letter-display">
                    <span>{letter}</span>
                    <small>LENSEGUA · referencia pendiente</small>
                  </div>
                  <div className="alphabet" aria-label="Letras del alfabeto">
                    {LETTERS.map((l) => (
                      <button
                        disabled={recording}
                        aria-pressed={letter === l}
                        className={letter === l ? "selected" : ""}
                        key={l}
                        onClick={() => {
                          setLetter(l);
                          setPreview(null);
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="reference-info">
                    <h3>Una referencia confiable primero</h3>
                    <p>
                      Necesitamos confirmar la forma y el movimiento de esta
                      letra antes de usar sus muestras para entrenar.
                    </p>
                    <a
                      href="https://conadi.gob.gt/web/lensegua/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Explorar recursos de CONADI ↗
                    </a>
                  </div>
                  <label className="upload">
                    Ver imagen de referencia local
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setPreview(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                  {preview && (
                    <div className="local-reference">
                      <img
                        src={preview}
                        alt={`Referencia local para la letra ${letter}, sin validar`}
                      />
                      <small>Vista temporal · material sin validar</small>
                    </div>
                  )}
                </section>
                <section className="camera-card card">
                  <div className="section-label">
                    <span>02 / CAPTURA UN INTENTO</span>
                    <span className={active ? "live" : ""}>
                      ● {active ? "Cámara activa" : "Cámara apagada"}
                    </span>
                  </div>
                  <div className="camera-view">
                    <video
                      ref={video}
                      muted
                      playsInline
                      aria-label="Vista de tu cámara"
                    />
                    <canvas ref={canvas} aria-hidden="true" />
                    {!active && (
                      <div className="camera-placeholder">
                        <div className="camera-symbol">◎</div>
                        <h2>Tu mano, el punto de partida.</h2>
                        <p>
                          Activa la cámara y coloca una mano en el encuadre.
                          <br />
                          Buscaremos sus 21 puntos de referencia.
                        </p>
                        <button
                          className="primary"
                          onClick={() => void startCamera()}
                          disabled={loading}
                        >
                          {loading ? "Preparando detector…" : "Activar cámara"}
                        </button>
                      </div>
                    )}
                    {recording && (
                      <div className="recording">
                        ● Capturando letra {letter} · {remaining}s
                      </div>
                    )}
                    <div className="camera-tag">PROCESAMIENTO LOCAL</div>
                  </div>
                  <div className="camera-status" role="status">
                    <span
                      className={detected ? "status-dot ready" : "status-dot"}
                    />
                    {status}
                    {(active || loading) && (
                      <button
                        className="text-button"
                        disabled={recording}
                        onClick={stopCamera}
                      >
                        Apagar cámara
                      </button>
                    )}
                  </div>
                  <div className="capture-form">
                    <div className="fields">
                      <label>
                        Código de participante
                        <input
                          value={participant}
                          disabled={recording}
                          onChange={(e) => setParticipant(e.target.value)}
                          placeholder="Ej. persona-01"
                          maxLength={60}
                        />
                      </label>
                      <label>
                        Sesión
                        <input
                          value={session}
                          disabled={recording}
                          onChange={(e) => setSession(e.target.value)}
                          placeholder="Ej. sesion-01"
                          maxLength={60}
                        />
                      </label>
                    </div>
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
                    <div className="capture-bottom">
                      <small>
                        Un intento = una secuencia de 3 segundos.
                        <br />
                        Usa un código, evita escribir tu nombre.
                      </small>
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
                          : `Capturar letra ${letter}`}{" "}
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                </section>
              </div>
              <div className="tips">
                <div>
                  <b>01</b>
                  <span>
                    <strong>Busca buena luz</strong>
                    <small>Ilumina la mano y evita el contraluz.</small>
                  </span>
                </div>
                <div>
                  <b>02</b>
                  <span>
                    <strong>Deja espacio</strong>
                    <small>Mantén los dedos dentro del encuadre.</small>
                  </span>
                </div>
                <div>
                  <b>03</b>
                  <span>
                    <strong>Varía los intentos</strong>
                    <small>Cambia un poco la distancia entre capturas.</small>
                  </span>
                </div>
              </div>
            </>
          )}
          {tab === "dataset" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">DATOS PARA EL SIGUIENTE PASO</p>
                  <h1>Cada intento cuenta.</h1>
                  <p>
                    Revisa y exporta las secuencias guardadas en esta
                    computadora.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={!samples.length}
                  onClick={() => downloadDataset(samples)}
                >
                  Exportar JSON ↓
                </button>
              </div>
              <div className="stats">
                <div className="card">
                  <strong>{samples.length}</strong>
                  <span>Intentos guardados</span>
                </div>
                <div className="card">
                  <strong>{new Set(samples.map((s) => s.label)).size}</strong>
                  <span>Letras capturadas</span>
                </div>
                <div className="card">
                  <strong>
                    {new Set(samples.map((s) => s.participant)).size}
                  </strong>
                  <span>Participantes</span>
                </div>
              </div>
              <div className="notice">
                <p>
                  Las etiquetas las asigna quien captura. Todos los intentos
                  están <strong>pendientes de revisión</strong>. Exporta un
                  respaldo: borrar los datos del navegador elimina las muestras.
                </p>
              </div>
              <section className="card samples">
                {samples.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Letra</th>
                          <th>Participante</th>
                          <th>Sesión</th>
                          <th>Cuadros</th>
                          <th>Estado</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...samples].reverse().map((s) => (
                          <tr key={s.id}>
                            <td>
                              <b className="sample-letter">{s.label}</b>
                            </td>
                            <td>{s.participant}</td>
                            <td>{s.session}</td>
                            <td>{s.frames.length}</td>
                            <td>
                              <span className="pill">Sin revisar</span>
                            </td>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => void removeSample(s.id)}
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty">
                    <h2>Tu colección empieza aquí.</h2>
                    <p>
                      Captura tu primer intento en el laboratorio del alfabeto.
                    </p>
                    <button
                      className="primary"
                      onClick={() => changeTab("practice")}
                    >
                      Ir al laboratorio →
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "roadmap" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">PASO A PASO, CON DATOS REALES</p>
                  <h1>La ruta de SeñaLab.</h1>
                  <p>
                    Primero capturar y validar. Después reconocer y enseñar.
                  </p>
                </div>
              </div>
              <div className="phases">
                {phases.map(([n, title, description, state]) => (
                  <section className="card phase" key={n}>
                    <b>{n}</b>
                    <div>
                      <h2>{title}</h2>
                      <p>{description}</p>
                    </div>
                    <span className="pill">{state}</span>
                  </section>
                ))}
              </div>
              <div className="notice">
                <p>
                  La precisión se medirá con personas distintas a las del
                  entrenamiento. No fijaremos un porcentaje hasta evaluar datos
                  reales.
                </p>
              </div>
            </>
          )}
          <footer>
            Hecho para acercarnos. <span>SeñaLab · Guatemala</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
export default App;
