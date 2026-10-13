# Validación inicial — 13 de octubre de 2026

- `npm test`: 3 pruebas aprobadas (normalización, entrada degenerada y esquema de exportación).
- `npm run build`: TypeScript y compilación de producción aprobados.
- `python -m unittest discover -s training/tests`: 4 pruebas aprobadas (normalización, exclusión de datos sin revisar, separación de participantes y mínimo de personas).
- Baseline de Python ejecutado con datos sintéticos temporales: produce modelo y reporte y conserva participantes separados. Esto no mide precisión real de LENSEGUA.
- Chromium automatizado: carga de interfaz, selección de letra, arranque del detector MediaPipe real con cámara simulada, apagado, mensaje de permiso denegado, persistencia de un registro de prueba en IndexedDB tras recargar, exportación y eliminación, cinco fases visibles y sin desbordamiento horizontal a 390 px. Sin excepciones JavaScript.
- Inspección visual del laboratorio a 1440 px.

Pendiente: capturar intentos con una mano real y cámara física, comprobar los archivos exportados de esas capturas, probar Chrome/Edge en los equipos destinatarios y validar referencias con una persona competente. La prueba de persistencia utiliza un registro sintético; no prueba calidad de señas ni reconocimiento de letras.

## Reconocimiento personal A–F

- Entrenamiento real local con 6 intentos (uno por letra), 36 cuadros cada uno, una persona y una sesión. No hay conjunto de prueba ni métricas de precisión.
- 7 pruebas web y 5 pruebas Python aprobadas, compilación de producción aprobada.
- Navegador: carga del modelo personal, preprocesamiento y probabilidades equivalentes a Python (tolerancia 1e-12) para las seis capturas; carga del detector con cámara simulada y rechazo de JSON incompatible.
- Sigue pendiente probar nuevos intentos con cámara física. La equivalencia numérica no demuestra precisión ni validez de las etiquetas.

## Entrenamiento y almacenamiento integrados

- 5 pruebas API/SQLite: aislamiento por perfil, deduplicación, eliminación, importación atómica, validación de muestras, entrenamiento con dos clases, persistencia al reabrir, modelo inicial y acceso HTTP por token de perfil.
- 7 pruebas web y 5 pruebas de entrenamiento aprobadas. Build TypeScript/producción aprobado.
- Prueba de navegador con API real y base temporal: copia de seis capturas desde IndexedDB, entrenamiento mediante botón, recuperación de modelo y muestras tras recarga, vuelta al modelo inicial sin borrar muestras, borrado individual, carga del detector con cámara simulada y otro perfil sin acceso a las muestras personales.
- Sin subida/descarga de JSON en el flujo, ni pestaña de fases. Sigue pendiente evaluar nuevos intentos con cámara física y más personas.

## Visor y foto opcional

- Build de producción y 6 pruebas API aprobados; prueba adicional de persistencia de foto opcional y rechazo de formato/cuadro inválido.
- Navegador con API real y base temporal: visor de muestras antiguas (21 puntos), deslizador, reproducción y cierre; foto JPEG de prueba asociada a su cuadro, vuelta a puntos en otros cuadros y opción de foto desactivada por defecto con consentimiento actualizado al activarla.
- La foto no se usa para entrenar. Las capturas antiguas no tienen fotografías recuperables. Falta probar la foto de una captura nueva con cámara física y revisar casos reales de confusión entre letras.
