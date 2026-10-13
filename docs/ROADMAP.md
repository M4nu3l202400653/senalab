# Ruta de trabajo de SeñaLab

Objetivo: web app para computadoras que enseña el alfabeto de LENSEGUA y evalúa intentos por cámara. Desarrollo incremental, sin afirmar precisión hasta medirla.

## Fase 1 — Fundamentos y referencias (en curso)

- [x] Definir lengua, dispositivos y alcance inicial.
- [x] Documentar las fuentes y el protocolo de muestras.
- [ ] Confirmar el inventario del alfabeto con una persona competente en LENSEGUA, incluida Ñ y cualquier variante.
- [ ] Clasificar letras estáticas y letras que requieren movimiento.
- [ ] Obtener imágenes/videos con permisos de reutilización y registrar fuente, licencia y revisión.

Salida: catálogo validado. Las 27 etiquetas actuales son candidatas del alfabeto español; no constituyen validación lingüística. No copiar el alfabeto ASL como sustituto.

## Fase 2 — Web y captura (base implementada)

- [x] React + TypeScript + Vite, interfaz en español.
- [x] Selección de letra, referencia local temporal y enlace a fuentes.
- [x] Cámara y detector MediaPipe con 21 puntos por mano.
- [x] Captura de intentos de 3 segundos con participante y sesión.
- [x] IndexedDB, listado, eliminación individual y exportación JSON.
- [x] Mensajes para permisos, errores y capturas incompletas.
- [x] Pruebas de normalización, formato y separación por persona; plantilla de CI.
- [ ] Probar con cámara física en Chrome/Edge y distintas computadoras.

Salida: herramienta reproducible de recolección. Los puntos se guardan; no se guardan imágenes ni audio. Los archivos de modelo y WASM se sirven localmente. La interfaz usa tipografía del sistema, el logo proporcionado por el equipo y sus colores verdes.

## Fase 3 — Datos y baseline (siguiente)

- [x] Script Python que exige revisión y separa participantes entre entrenamiento y prueba.
- [ ] Seleccionar 5–10 letras estáticas validadas para el piloto.
- [ ] Recolectar intentos de varias personas y sesiones; definir tamaños tras el piloto.
- [ ] Revisar etiquetas y calidad; un intento puede estar mal aunque el usuario lo etiquete con una letra.
- [ ] Comparar Random Forest con otro baseline; documentar confusiones por letra.
- [ ] Incorporar conjunto de desarrollo y prueba final reservada si se ajustan modelos/umbrales.

Salida: reporte por letra, matriz de confusión y resultados en personas nuevas. Cuatro participantes es el mínimo técnico del script, no un tamaño suficiente para afirmar generalización. La agregación por mediana es solo para letras estáticas. No ajustar el modelo repetidamente mirando la prueba final.

## Fase 4 — Reconocimiento didáctico

- [x] Exportar un baseline Random Forest a JSON compatible con navegador (demo personal).
- [x] Mantener idéntico preprocesamiento entre Python y web y verificar paridad.
- [ ] Calibrar umbral con conjunto de desarrollo, incluir ejemplos fuera de catálogo y postura neutra.
- [ ] Evaluar una secuencia por intento y permitir rechazo por evidencia insuficiente.
- [ ] Registrar progreso; reconocer intención no equivale a evaluar ejecución correcta.

Salida: práctica real para letras soportadas con límites explícitos y medición de latencia.

## Fase 5 — Ampliación

- [ ] Modelo temporal para letras con movimiento y muestras con trayectorias verificadas.
- [ ] Alfabeto completo validado, accesibilidad y pruebas con comunidad usuaria.
- [ ] Más vocabulario, cuentas y sincronización si el uso lo requiere.

Salida: alfabeto ampliado, documentación y evaluación reproducible.

## Piloto personal A–F

Se habilita un modo experimental para una sola persona, incluso con un intento por letra. No usa prueba separada ni reporta precisión; no cambia la revisión de las muestras. La web muestra una candidata entre las clases cargadas, sin validar corrección ni rechazar gestos fuera del catálogo. Los datos y el modelo personal quedan fuera de Git.
