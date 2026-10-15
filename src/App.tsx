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
import {
  deleteSample,
  loadSamples,
  saveSample,
  importDataset,
} from "./lib/storage";
import {
  recognize,
  recognizeForPractice,
  type RecognitionModel,
} from "./lib/recognizer";
import { modelRequest, request } from "./lib/api";
import { REFERENCE_CROPS } from "./lib/references";
import { SampleViewer } from "./SampleViewer";
import {
  runCaptureSeries,
  waitFor,
  type SeriesProgress,
} from "./lib/captureSeries";
import { LearningPanel } from "./LearningPanel";
import { LetterReference } from "./LetterReference";
import {
  loadPracticeHistory,
  savePracticeAttempt,
  practiceOutcome,
  type PracticeAttempt,
} from "./lib/learning";
import "./App.css";

type Tab = "learn" | "practice" | "recognition" | "dataset";
function App() {
  const [tab, setTab] = useState<Tab>("learn");
  const [lessonLetter, setLessonLetter] = useState("A");
  const [history, setHistory] = useState<PracticeAttempt[]>([]);
  const [lessonResult, setLessonResult] = useState<PracticeAttempt | null>(
    null,
  );
  const lessonTarget = useRef<string | null>(null);
  const [letter, setLetter] = useState("A");
  const [participant, setParticipant] = useState("");
  const [session, setSession] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [savePhoto, setSavePhoto] = useState(false);
  const [viewedSample, setViewedSample] = useState<string | null>(null);
  const photoEnabled = useRef(false);
  const capturedPhoto = useRef<Sample["photo"]>(undefined);
  const [consent, setConsent] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [status, setStatus] = useState("Cámara apagada");
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState(false);
  const [seriesProgress, setSeriesProgress] = useState<SeriesProgress | null>(
    null,
  );
  const seriesController = useRef<AbortController | null>(null);
  const [recording, setRecording] = useState(false);
  const [recognizer, setRecognizer] = useState<RecognitionModel | null>(null);
  const [modelSource, setModelSource] = useState<"initial" | "personal" | null>(
    null,
  );
  const [modelReady, setModelReady] = useState(false);
  const [capabilities, setCapabilities] = useState({
    trainingEnabled: true,
    photoCaptureEnabled: true,
    teamImportEnabled: true,
  });
  const [training, setTraining] = useState(false);
  const [importing, setImporting] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(false);
  const [message, setMessage] = useState("");
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
            "No se pudo conectar al almacenamiento del servidor. Espera unos momentos y recarga.",
          );
      });
    modelRequest()
      .then((result) => {
        if (mounted.current) {
          setRecognizer(result.model);
          setModelSource(result.source);
          setModelReady(true);
        }
      })
      .catch((error) => {
        if (mounted.current) {
          setModelReady(true);
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo cargar el modelo del servidor.",
          );
        }
      });
    request<typeof capabilities>("/config")
      .then((config) => {
        if (mounted.current) {
          setCapabilities(config);
          if (!config.photoCaptureEnabled) setSavePhoto(false);
        }
      })
      .catch(() => {
        if (mounted.current)
          setError(
            "No se pudo cargar la configuración del servidor. Recarga la página.",
          );
      });
    loadPracticeHistory()
      .then((items) => {
        if (mounted.current) setHistory(items);
      })
      .catch(() => {
        if (mounted.current)
          setError(
            "No se pudo cargar el progreso. Espera unos momentos y recarga.",
          );
      });
    return () => {
      mounted.current = false;
      seriesController.current?.abort();
      generation.current++;
      cancelAnimationFrame(animation.current);
      if (timer.current) clearTimeout(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      model.current?.close();
    };
  }, []);

  function stopCamera() {
    seriesController.current?.abort();
    generation.current++;
    cancelAnimationFrame(animation.current);
    if (timer.current) clearTimeout(timer.current);
    frames.current = null;
    capturedPhoto.current = undefined;
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
            if (frames.current && valid) {
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
              if (
                !testing.current &&
                photoEnabled.current &&
                !capturedPhoto.current &&
                now - started.current >= 1500
              ) {
                const snapshot = document.createElement("canvas");
                snapshot.width = Math.min(640, video.current.videoWidth);
                snapshot.height = Math.round(
                  (snapshot.width * video.current.videoHeight) /
                    video.current.videoWidth,
                );
                snapshot
                  .getContext("2d")!
                  .drawImage(
                    video.current,
                    0,
                    0,
                    snapshot.width,
                    snapshot.height,
                  );
                capturedPhoto.current = {
                  dataUrl: snapshot.toDataURL("image/jpeg", 0.7),
                  frameIndex: frames.current.length - 1,
                };
              }
            }
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
      if (!seriesController.current) setRecording(false);
      setError(
        "Captura incompleta: mantén una sola mano visible durante al menos dos segundos y vuelve a intentarlo.",
      );
      return false;
    }
    if (testing.current) {
      try {
        if (!recognizer)
          throw new Error(
            "No hay un modelo disponible. Entrena con tus muestras primero.",
          );
        if (lessonTarget.current) {
          const target = lessonTarget.current;
          const candidate = recognizeForPractice(recognizer, captured);
          const attempt: PracticeAttempt = {
            id: crypto.randomUUID(),
            target,
            candidate,
            outcome: practiceOutcome(target, candidate),
            modelSource: modelSource ?? "initial",
          };
          setLessonResult(attempt);
          try {
            const saved = await savePracticeAttempt(attempt);
            if (mounted.current) setHistory((items) => [...items, saved]);
          } catch {
            if (mounted.current)
              setError(
                "El resultado está disponible, pero no se pudo guardar el progreso en el servidor.",
              );
          }
        } else setPrediction(recognize(recognizer, captured));
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
      ...(capturedPhoto.current ? { photo: capturedPhoto.current } : {}),
    };
    try {
      await saveSample(sample);
      if (mounted.current) {
        setSamples((s) => [...s, sample]);
        setStatus(`Intento de ${label} guardado · pendiente de revisión`);
      }
      return true;
    } catch {
      if (mounted.current)
        setError(
          "No se pudo guardar el intento en el servidor. Revisa que la aplicación esté iniciada y vuelve a capturar.",
        );
      return false;
    } finally {
      if (mounted.current && !seriesController.current) setRecording(false);
    }
  }
  async function capture() {
    if (
      !active ||
      !detected ||
      recording ||
      seriesController.current ||
      !storageReady ||
      !consent ||
      !participant.trim() ||
      !session.trim()
    )
      return;
    const controller = new AbortController();
    seriesController.current = controller;
    const label = letter,
      person = participant.trim(),
      visit = session.trim();
    let saved = 0;
    setError("");
    setMessage("");
    setPrediction("");
    setRecording(true);
    testing.current = false;
    photoEnabled.current = savePhoto;
    try {
      await runCaptureSeries({
        signal: controller.signal,
        capture: async (attempt) => {
          setSeriesProgress({ attempt, total: 5, phase: "capture" });
          capturedPhoto.current = undefined;
          frames.current = [];
          started.current = performance.now();
          setRemaining(3);
          await waitFor(3000, controller.signal);
          const valid = await finishCapture(label, person, visit);
          if (valid) saved++;
          return Boolean(valid);
        },
        rest: async (attempt) => {
          setSeriesProgress({ attempt, total: 5, phase: "rest" });
          for (let seconds = 3; seconds > 0; seconds--) {
            setRemaining(seconds);
            await waitFor(1000, controller.signal);
          }
        },
      });
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === "AbortError") &&
        mounted.current
      )
        setError("No se pudo completar la serie de capturas.");
    } finally {
      if (seriesController.current === controller) {
        seriesController.current = null;
        frames.current = null;
        capturedPhoto.current = undefined;
        if (mounted.current) {
          setRecording(false);
          setSeriesProgress(null);
          setRemaining(0);
          setMessage(
            `${saved} de 5 intentos de ${label} guardados${saved === 5 ? ". Serie completada." : ". Los intentos ya guardados se conservan."}`,
          );
        }
      }
    }
  }
  function testRecognition() {
    if (!active || !detected || recording || !recognizer) return;
    setError("");
    setPrediction("");
    setLessonResult(null);
    lessonTarget.current = tab === "learn" ? lessonLetter : null;
    if (
      lessonTarget.current &&
      !recognizer.labels.includes(lessonTarget.current)
    )
      return;
    testing.current = true;
    frames.current = [];
    started.current = performance.now();
    setRemaining(3);
    setRecording(true);
    timer.current = setTimeout(() => {
      void finishCapture("", "", "");
    }, 3000);
  }
  async function trainPersonalModel() {
    if (!capabilities.trainingEnabled || training || importing || recording)
      return;
    stopCamera();
    setTraining(true);
    setError("");
    setMessage("");
    try {
      const result = await modelRequest("POST", "/train");
      if (mounted.current) {
        setRecognizer(result.model);
        setModelSource(result.source);
        setMessage(
          `Modelo personal entrenado con ${result.attempts} intentos y guardado. Ya puedes probarlo en Reconocimiento.`,
        );
      }
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo entrenar el modelo.",
        );
    } finally {
      if (mounted.current) setTraining(false);
    }
  }
  async function useInitialModel() {
    if (training || importing || recording) return;
    stopCamera();
    setTraining(true);
    setError("");
    setMessage("");
    try {
      const result = await modelRequest("DELETE");
      if (mounted.current) {
        setRecognizer(result.model);
        setModelSource(result.source);
        setMessage(
          "Se seleccionó el modelo inicial. Tus muestras se conservan.",
        );
      }
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "No se pudo cambiar el modelo.",
        );
    } finally {
      if (mounted.current) setTraining(false);
    }
  }
  async function importFiles(files: File[]) {
    if (training || importing || recording) return;
    setImporting(true);
    setError("");
    setMessage("");
    let added = 0,
      duplicates = 0,
      completed = 0;
    try {
      for (const file of files) {
        if (file.size > 50_000_000)
          throw new Error(
            `${file.name}: el archivo supera 50 MB. Exporta sin fotos o divide la recolección.`,
          );
        let value;
        try {
          value = JSON.parse(await file.text());
        } catch {
          throw new Error(`${file.name}: no contiene JSON válido.`);
        }
        const result = await importDataset(value);
        added += result.added;
        duplicates += result.duplicates;
        completed++;
      }
      setMessage(
        `Importación terminada: ${added} intentos nuevos, ${duplicates} duplicados omitidos. Reentrena para incorporarlos al modelo.`,
      );
    } catch (error) {
      setError(
        `${error instanceof Error ? error.message : "No se pudieron importar las muestras."} ${completed ? `${completed} archivos anteriores ya se importaron (${added} intentos nuevos).` : "No se importó ningún archivo."}`,
      );
    } finally {
      try {
        setSamples(await loadSamples());
      } catch {
        setError(
          "No se pudo actualizar la lista de muestras. Recarga para consultar lo guardado.",
        );
      }
      setImporting(false);
    }
  }
  function changeTab(next: Tab) {
    stopCamera();
    setViewedSample(null);
    setTab(next);
    setLessonResult(null);
    setError("");
    setMessage("");
  }
  async function removeSample(id: string) {
    try {
      await deleteSample(id);
      setSamples((s) => s.filter((sample) => sample.id !== id));
      if (viewedSample === id) setViewedSample(null);
    } catch {
      setError("No se pudo eliminar la muestra.");
    }
  }
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
          disabled={training || importing || recording}
          aria-pressed={tab === "learn"}
          onClick={() => changeTab("learn")}
        >
          Aprender
        </button>
        <button
          disabled={training || importing || recording}
          aria-pressed={tab === "practice"}
          onClick={() => changeTab("practice")}
        >
          Capturar muestras
        </button>
        <button
          disabled={training || importing || recording}
          aria-pressed={tab === "recognition"}
          onClick={() => changeTab("recognition")}
        >
          Reconocimiento
        </button>
        <button
          disabled={training || importing || recording}
          aria-pressed={tab === "dataset"}
          onClick={() => changeTab("dataset")}
        >
          Mis muestras ({samples.length})
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
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {(tab === "practice" || tab === "recognition" || tab === "learn") && (
          <>
            <h2>
              {tab === "learn"
                ? "Aprender el alfabeto"
                : tab === "practice"
                  ? "Capturar muestras"
                  : "Reconocimiento"}
            </h2>
            <p className="notice">
              {tab === "learn"
                ? "Practica una letra por vez con la referencia y revisa el resultado de tu intento."
                : tab === "practice"
                  ? "Guarda intentos etiquetados para entrenar el modelo."
                  : "Activa la cámara y prueba una seña durante 3 segundos. Puedes usar el modelo inicial o entrenar uno personal; probar no guarda el intento."}
            </p>
            <div className="workspace">
              {tab === "learn" ? (
                <LearningPanel
                  letter={lessonLetter}
                  supported={recognizer?.labels ?? []}
                  busy={recording || training || importing}
                  history={history}
                  result={lessonResult}
                  onSelect={(value) => {
                    setLessonLetter(value);
                    setLessonResult(null);
                  }}
                  onNext={() => {
                    const supported = (recognizer?.labels ?? []).filter(
                      (l) => REFERENCE_CROPS[l],
                    );
                    setLessonLetter(
                      supported[
                        (supported.indexOf(lessonLetter) + 1) % supported.length
                      ],
                    );
                    setLessonResult(null);
                  }}
                />
              ) : tab === "practice" ? (
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
                    <LetterReference letter={letter} />
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
                      checked={savePhoto}
                      disabled={recording || !capabilities.photoCaptureEnabled}
                      onChange={(e) => setSavePhoto(e.target.checked)}
                    />
                    {capabilities.photoCaptureEnabled
                      ? "Guardar una foto del intento para revisarlo (opcional)."
                      : "Esta versión pública guarda solo puntos, sin fotografías."}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={recording}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    {capabilities.trainingEnabled ? (
                      <>
                        Acepto guardar los puntos de mi mano
                        {savePhoto ? " y una foto del intento" : ""} en el
                        servidor de la aplicación. No se guarda audio.
                      </>
                    ) : (
                      "Acepto aportar los puntos de mi mano para mejorar el modelo de SeñaLab. No se guardan fotos ni audio."
                    )}
                  </label>
                </section>
              ) : (
                <section className="panel">
                  <h3>Modelo</h3>
                  <div className="recognition">
                    {!modelReady && <p>Cargando modelo…</p>}
                    {modelReady && !recognizer && (
                      <p>
                        {capabilities.trainingEnabled
                          ? "No hay un modelo disponible. Captura muestras de al menos dos letras y entrena tu modelo personal."
                          : "El equipo todavía no ha publicado un modelo. Puedes consultar las referencias y aportar muestras mientras tanto."}
                      </p>
                    )}
                    {recognizer && (
                      <>
                        <p>
                          <strong>
                            {modelSource === "personal"
                              ? "Tu modelo personal"
                              : "Modelo inicial del prototipo"}
                          </strong>
                          <br />
                          Letras: {recognizer.labels.join(", ")}.
                        </p>
                        <p className="help">
                          {modelSource === "initial"
                            ? "Modelo inicial experimental; su precisión todavía requiere evaluación formal."
                            : "Modelo personal experimental, sin medición de precisión."}{" "}
                          El resultado elige entre las letras del modelo; no
                          valida si la seña está bien realizada ni descarta
                          gestos ajenos al catálogo.
                        </p>
                      </>
                    )}
                    <p>
                      {capabilities.trainingEnabled
                        ? "Personalizar es opcional. Captura muestras de tu mano y entrena cuando quieras."
                        : "Esta web utiliza el modelo publicado. Puedes contribuir con muestras para las próximas versiones."}
                    </p>
                    <div className="actions">
                      <button
                        disabled={training || importing || recording}
                        onClick={() => changeTab("practice")}
                      >
                        Capturar mis muestras
                      </button>
                      <button
                        className="primary"
                        disabled={
                          !capabilities.trainingEnabled ||
                          training ||
                          recording ||
                          !storageReady ||
                          new Set(samples.map((s) => s.label)).size < 2
                        }
                        onClick={() => void trainPersonalModel()}
                      >
                        {!capabilities.trainingEnabled
                          ? "Entrenamiento en la versión local"
                          : training
                            ? "Entrenando…"
                            : "Entrenar con mis muestras"}
                      </button>
                      {modelSource === "personal" && (
                        <button
                          disabled={training || importing || recording}
                          onClick={() => void useInitialModel()}
                        >
                          Usar modelo inicial
                        </button>
                      )}
                    </div>
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
                        : seriesProgress?.phase === "rest"
                          ? "Suelta y vuelve a colocar la mano"
                          : `Capturando ${letter} · ${seriesProgress?.attempt ?? 1}/5`}{" "}
                      · {remaining}s
                    </span>
                  )}
                </div>
                {seriesProgress && (
                  <p className="notice" role="status">
                    {seriesProgress.phase === "rest"
                      ? `Pausa: suelta y vuelve a colocar la mano. El intento ${seriesProgress.attempt} de 5 empieza en ${remaining}s.`
                      : `Intento ${seriesProgress.attempt} de 5: mantén la seña durante 3 segundos.`}
                  </p>
                )}
                <p role="status">{status}</p>
                <div className="actions">
                  {active || loading ? (
                    <button disabled={recording} onClick={stopCamera}>
                      Apagar cámara
                    </button>
                  ) : (
                    <button
                      disabled={training || importing}
                      onClick={() => void startCamera()}
                    >
                      Activar cámara
                    </button>
                  )}
                  {tab === "practice" ? (
                    <button
                      className="primary"
                      onClick={() => void capture()}
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
                        ? "Serie en curso…"
                        : `Capturar 5 intentos de ${letter}`}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={
                        !recognizer ||
                        !active ||
                        !detected ||
                        recording ||
                        training ||
                        (tab === "learn" &&
                          !recognizer.labels.includes(lessonLetter))
                      }
                      onClick={testRecognition}
                    >
                      {recording
                        ? "Evaluando intento…"
                        : tab === "learn"
                          ? `Practicar letra ${lessonLetter}`
                          : "Probar reconocimiento (3 s)"}
                    </button>
                  )}
                </div>
                {seriesProgress && (
                  <button onClick={() => seriesController.current?.abort()}>
                    Cancelar serie
                  </button>
                )}
                <p className="help">
                  {tab === "practice"
                    ? "Una serie guarda 5 intentos de 3 segundos, con pausas de 3 segundos para repetir la seña. No mantengas la misma postura toda la serie."
                    : "Cada prueba dura 3 segundos."}{" "}
                  Mantén una sola mano visible y usa buena iluminación.
                </p>
              </section>
            </div>
          </>
        )}
        {tab === "dataset" && (
          <>
            <h2>Mis muestras</h2>
            <p>
              {samples.length} intentos guardados en el servidor de la
              aplicación.
            </p>
            <p className="notice">
              {capabilities.trainingEnabled
                ? "Estas muestras se guardan en el programa y se usan para tu modelo personal."
                : "Estas muestras se guardan como contribuciones para mejorar el modelo de SeñaLab."}{" "}
              Las etiquetas están pendientes de revisión.
            </p>
            <button
              className="primary"
              disabled={
                !capabilities.trainingEnabled ||
                training ||
                importing ||
                !storageReady ||
                new Set(samples.map((s) => s.label)).size < 2
              }
              onClick={() => void trainPersonalModel()}
            >
              {!capabilities.trainingEnabled
                ? "Entrenamiento en la versión local"
                : training
                  ? "Entrenando…"
                  : "Entrenar con mis muestras"}
            </button>
            <section
              className="dataset-transfer"
              aria-label="Compartir muestras del equipo"
            >
              <h3>Compartir muestras del equipo</h3>
              <p className="help">
                Exporta tus capturas para enviarlas al coordinador, o importa
                las de tus compañeros. Se conservan participante, sesión e
                identificadores. Importar no entrena el modelo.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={includePhotos}
                  onChange={(e) => setIncludePhotos(e.target.checked)}
                />
                Incluir las fotos opcionales en el archivo exportado.
              </label>
              <button
                disabled={!samples.length || importing || training}
                onClick={() => downloadDataset(samples, includePhotos)}
              >
                Exportar muestras del equipo
              </button>
              <label>
                Importar archivos de muestras (.json)
                <input
                  type="file"
                  multiple
                  accept=".json,application/json"
                  disabled={
                    !capabilities.teamImportEnabled ||
                    importing ||
                    training ||
                    !storageReady
                  }
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length) void importFiles(files);
                  }}
                />
              </label>
              {!capabilities.teamImportEnabled && (
                <p className="help">
                  La importación y el entrenamiento del equipo se realizan en la
                  versión local. Las capturas nuevas se guardan aquí como
                  contribuciones.
                </p>
              )}
              {importing && <p role="status">Importando muestras…</p>}
              <p>
                {new Set(samples.map((s) => s.participant)).size} participantes
                · {new Set(samples.map((s) => s.label)).size} letras.
              </p>
            </section>
            {viewedSample && samples.find((s) => s.id === viewedSample) && (
              <SampleViewer
                key={viewedSample}
                sample={samples.find((s) => s.id === viewedSample)!}
                onClose={() => setViewedSample(null)}
              />
            )}
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
                          <button onClick={() => setViewedSample(s.id)}>
                            Ver intento
                          </button>{" "}
                          <button
                            disabled={training || importing}
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
              <p>No hay muestras. Puedes empezar en «Capturar muestras».</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
export default App;
