# Validación inicial — 13 de octubre de 2026

- `npm test`: 3 pruebas aprobadas (normalización, entrada degenerada y esquema de exportación).
- `npm run build`: TypeScript y compilación de producción aprobados.
- `python -m unittest discover -s training/tests`: 4 pruebas aprobadas (normalización, exclusión de datos sin revisar, separación de participantes y mínimo de personas).
- Baseline de Python ejecutado con datos sintéticos temporales: produce modelo y reporte y conserva participantes separados. Esto no mide precisión real de LENSEGUA.
- Chromium automatizado: carga de interfaz, selección de letra, arranque del detector MediaPipe real con cámara simulada, apagado, mensaje de permiso denegado, persistencia de un registro de prueba en IndexedDB tras recargar, exportación y eliminación, cinco fases visibles y sin desbordamiento horizontal a 390 px. Sin excepciones JavaScript.
- Inspección visual del laboratorio a 1440 px.

Pendiente: capturar intentos con una mano real y cámara física, comprobar los archivos exportados de esas capturas, probar Chrome/Edge en los equipos destinatarios y validar referencias con una persona competente. La prueba de persistencia utiliza un registro sintético; no prueba calidad de señas ni reconocimiento de letras.
