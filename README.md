# SeñaLab

Web app didáctica para el alfabeto de la Lengua de Señas de Guatemala (LENSEGUA). Versión 0.1: laboratorio de captura para preparar datos de entrenamiento.

**Prototipo experimental.** Detecta manos con MediaPipe, guarda secuencias etiquetadas y las exporta para revisión/entrenamiento. Permite cargar un modelo JSON y obtener una letra candidata por intento; no evalúa la corrección de la seña. Las referencias del alfabeto están pendientes de validación lingüística.

## Ejecutar la web

Requiere Node.js 22.12+ o 24 y npm.

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Abre la URL local que imprime Vite. Usa Chrome o Edge de escritorio, permite la cámara y selecciona una letra. Ingresa un código de participante, sesión y consentimiento; captura un intento de tres segundos. En **Mis muestras**, exporta el JSON o elimina intentos.

La cámara requiere localhost o HTTPS. La detección usa el modelo y WASM incluidos en `public/`; no se sube video. Las muestras quedan en IndexedDB, por navegador/origen, y no se sincronizan entre computadoras. Borrar datos del sitio las elimina: exporta respaldos. La referencia local es temporal y no se exporta.

```bash
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

## Baseline en Python

Requiere Python 3.11+ y un dataset con etiquetas verificadas; el piloto recomienda 3.11/3.12.

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r training/requirements.txt
python -m unittest discover -s training/tests
python training/train.py data/revisado.json --labels A,B,C --output training/artifacts
```

Las letras del comando son un ejemplo, no una lista validada de letras estáticas. El script excluye intentos sin `reviewed: true`, exige al menos cuatro participantes y presencia de cada clase en ambos conjuntos. Cada intento es una observación. Reporta métricas por letra y participantes de cada conjunto; el modelo `joblib` es para Python. También genera `model.json`, que se carga en la web desde «Modelo de reconocimiento (.json)». Nunca cargues modelos joblib de fuentes no confiables.

## Demostración personal con pocas muestras

Para probar con una sola persona, usar explícitamente `--personal`:

```bash
python training/train.py data/personal-af.json --labels A,B,C,D,E,F --personal --output training/artifacts/personal-af
```

Este modo acepta las etiquetas del usuario sin modificar `reviewed` y entrena con todos los intentos. No genera métricas de precisión ni conjunto de prueba. Con un intento por letra sirve para comprobar el flujo, pero no garantiza reconocer nuevos intentos. La evaluación normal conserva la revisión obligatoria y la separación por persona.

En la web, seleccionar `training/artifacts/personal-af/model.json`, activar la cámara y pulsar **Probar reconocimiento (3 s)**. No hace falta consentimiento de almacenamiento ni código de participante para probar: el intento se procesa temporalmente y no se guarda. El resultado elige una letra entre las clases del modelo; puede asignar una letra a gestos ajenos al catálogo. El archivo del modelo se carga de nuevo al recargar la página. No subir datos personales ni modelos derivados a GitHub.

Para ampliar: recopilar intentos independientes, repetir sesiones y personas, revisar etiquetas y reentrenar. El modelo actual usa posiciones agregadas de letras estáticas; las señas con movimiento requieren otro enfoque.

## Estructura y plan

- `src/`: interfaz, cámara, persistencia y formato de datos.
- `training/`: baseline Python y pruebas.
- `docs/ROADMAP.md`: fases y criterios de salida.
- `docs/DATASET.md`: protocolo, revisión y fuentes.
- `public/models/`, `public/mediapipe/`: detector y runtime servidos localmente.

Consultar [ruta de trabajo](docs/ROADMAP.md) y [protocolo de muestras](docs/DATASET.md). Los datos reales y los modelos entrenados están ignorados por Git. No se incluyen imágenes de señas descargadas sin permiso.

## Recursos externos

[MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) aporta detección de puntos, no reconocimiento de LENSEGUA. Véase `THIRD_PARTY.md` para assets y procedencia.

## Automatización

`docs/ci.github-actions.yml` contiene la configuración para ejecutar las pruebas web/Python y el build en GitHub Actions. Está como plantilla porque la credencial disponible permite subir código pero no crear workflows. Para activarla con una credencial que tenga permiso `workflow`, moverla a `.github/workflows/ci.yml` y subir el cambio.
