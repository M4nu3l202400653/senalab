# SeñaLab

Prototipo web de escritorio para el alfabeto de la Lengua de Señas de Guatemala (LENSEGUA). Cámara y detección de manos en el navegador; captura, almacenamiento y entrenamiento integrados con un servidor Python.

## Flujo actual

1. Entrar a **Reconocimiento**. El programa carga automáticamente el modelo inicial o el último modelo personal del perfil.
2. Activar la cámara y pulsar **Probar reconocimiento (3 s)**. No guarda este intento.
3. Opcionalmente, ir a **Capturar muestras**, seleccionar letras y guardar intentos con la mano del usuario.
4. Pulsar **Entrenar con mis muestras** en Reconocimiento o Mis muestras. El servidor entrena y guarda el modelo; queda disponible automáticamente, incluso tras recargar.
5. **Usar modelo inicial** elimina el modelo personal activo y vuelve al inicial, conservando las muestras para poder reentrenar.

El reconocimiento no requiere descargar ni cargar modelos JSON. Para recolección con el equipo, Mis muestras permite exportar/importar datasets JSON. El protocolo interno usa JSON por HTTP. El entrenamiento personal requiere al menos un intento de dos letras distintas; no mide precisión ni valida las etiquetas. El resultado es una candidata entre las letras del modelo, no una evaluación de ejecución ni un rechazo fiable de gestos fuera del catálogo.

La lámina proporcionada por el equipo se muestra con un recorte por letra; está pendiente de validación para LENSEGUA y no incluye Ñ. El modelo inicial disponible en este entorno sigue siendo el piloto A–F con seis intentos de una sola persona.

## Iniciar en desarrollo

Requiere Node.js 22.12+ o 24, npm y Python 3.11/3.12 con las dependencias de entrenamiento:

```bash
npm ci
python3.11 -m venv .venv
.venv/bin/pip install -r training/requirements.txt
npm run dev
```

Si ya existe `.venv` y están instaladas las dependencias, basta con `npm run dev`. Este comando inicia ambos procesos: servidor Python en `127.0.0.1:8000` y Vite en `127.0.0.1:5173`. Usa la URL de Vite en Chrome/Edge y permite la cámara. Ctrl+C detiene ambos. Conserva el mismo origen/puerto para conservar el perfil y migrar las capturas previas.

Se puede elegir el intérprete con `SENALAB_PYTHON` y el puerto API con `SENALAB_API_PORT`. El frontend usa un proxy hacia el servidor; `npm run dev:web` solo inicia Vite y requiere una API ya disponible.

## Almacenamiento del programa

`data/senalab.sqlite` guarda muestras y modelos en SQLite, fuera de Git. Se separan por un perfil anónimo cuyo identificador de acceso se conserva en el navegador. Los datos quedan en el servidor; borrar el identificador del navegador crea un perfil nuevo y pierde el acceso automático al anterior, pero no elimina la base de datos. No hay cuentas ni sincronización entre dispositivos en esta fase.

Al abrir por primera vez esta versión, las muestras de IndexedDB se copian al servidor, sin borrar el original ni duplicar IDs. El indicador de migración queda en el navegador. La cámara procesa puntos localmente: para guardar/entrenar se envían coordenadas, etiquetas, participante y sesión, sin audio. Por defecto no se envían imágenes; si el usuario activa «Guardar una foto del intento», se guarda un JPEG de referencia junto a los puntos. La prueba de reconocimiento se procesa temporalmente en el navegador y no se envía al servidor.

En el primer inicio, si existe `training/artifacts/personal-af/model.json`, el servidor lo importa como modelo inicial a SQLite. Después lo obtiene de SQLite sin depender del archivo. En un clon nuevo sin datos privados no hay modelo inicial; se puede entrenar uno desde la interfaz o configurar `SENALAB_DEFAULT_MODEL` con un modelo exportado. Se puede configurar `SENALAB_DB` para otra base. Los modelos personales nunca se convierten automáticamente en el modelo inicial compartido.

Este servidor se ejecuta en la computadora actual. Desplegarlo en la nube para múltiples usuarios requiere almacenamiento persistente e identidad de usuarios; aún no se ha desplegado. Guardar datos en el servidor local no implica subirlos a GitHub.

## Comprobaciones

```bash
npm test
npm run build
.venv/bin/python -m unittest discover -s training/tests
.venv/bin/python -m unittest discover -s server/tests
```

La API también puede servir el build para una prueba local:

```bash
npm run build
.venv/bin/python -m server.app
```

Abrir `http://127.0.0.1:8000`. Ese origen crea un perfil distinto al usado en Vite.

## Estructura

- `src/`: interfaz, cámara, cliente API y reconocimiento Random Forest en navegador.
- `server/app.py`: API HTTP, SQLite y entrenamiento Python; servidor local de prototipo.
- `scripts/dev.mjs`: inicia y detiene API y Vite juntos.
- `training/`: entrenamiento por CLI, exportación de modelos y evaluación por participante.
- `docs/`: plan técnico, protocolo de datos y resultados de verificación.
- `public/`: logo, lámina, modelo detector de manos y runtime MediaPipe.

El reconocimiento continuo en tiempo real queda para una próxima iteración. Hoy se evalúan secuencias de tres segundos con normalización por muñeca/escala y mediana por intento, pensadas para posiciones estáticas.

## Entrenamiento por CLI (desarrollo)

El flujo normal se realiza desde la web. La herramienta CLI permanece disponible para experimentos con datasets exportados previamente:

```bash
.venv/bin/python training/train.py data/revisado.json --labels A,B,C --output training/artifacts
.venv/bin/python training/train.py data/personal-af.json --labels A,B,C,D,E,F --personal --output training/artifacts/personal-af
```

Sin `--personal`, exige revisión y separación de participantes, con al menos cuatro personas y todas las clases en entrenamiento y prueba. Con `--personal`, usa todos los intentos sin métricas de precisión y sin alterar su estado de revisión. Nunca cargar archivos joblib de fuentes desconocidas.

## Automatización y recursos

`docs/ci.github-actions.yml` contiene la plantilla de CI con pruebas web/Python/API y build. La credencial actual de GitHub no permite crear workflows; activarla requiere moverla a `.github/workflows/ci.yml` con una credencial que tenga permiso `workflow`.

Ver [ruta técnica](docs/ROADMAP.md), [protocolo](docs/DATASET.md) y [recursos de terceros](THIRD_PARTY.md). [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) detecta puntos; no reconoce LENSEGUA por sí mismo.

## Revisar capturas y confusiones

En **Mis muestras → Ver intento** se pueden reproducir los puntos o recorrer los cuadros con un deslizador. Las muestras anteriores solo tienen posiciones. Las nuevas capturas pueden guardar una foto opcional, tomada alrededor de la mitad del intento, vinculada al mismo cuadro de puntos. Al elegir ese cuadro se muestra la foto con los puntos; los demás cuadros muestran solo las posiciones. La foto se almacena en el servidor y no se usa como entrada del modelo.

Si hay confusión entre letras, revisar etiquetas, orientación y detección, eliminar/repetir las capturas incorrectas y reunir más intentos independientes de ambas letras antes de reentrenar. Un solo intento por clase no permite valorar precisión. El visor no valida automáticamente la corrección de la seña.

## Recolección con compañeros

Cada compañero puede clonar y ejecutar localmente, capturar bajo un código estable y usar **Mis muestras → Exportar muestras del equipo**. El coordinador importa los archivos desde esa misma pantalla y entrena. La importación conserva identidades e IDs, omite duplicados y no reentrena automáticamente. Consultar [instrucciones del equipo](docs/TEAM_COLLECTION.md) para instalación Linux/macOS/Windows, códigos, sesiones y entrega. El repositorio privado requiere acceso de colaboradores.
