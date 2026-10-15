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

## Recolección local en equipo

- 7 pruebas API y 7 pruebas web aprobadas; build de producción aprobado.
- Prueba de navegador con API y base temporal: importación de dos participantes, reimportación sin duplicados, preservación de UUID/código, exportación de puntos sin fotos por defecto y con fotos al optar por incluirlas, rechazo de otro identificador de lengua y recuperación tras recarga.
- Cada archivo se valida y guarda de forma atómica; no se reentrena al importar.
- Instrucciones de instalación y captura para seis personas en docs/TEAM_COLLECTION.md. Los datos reales no se suben al repositorio.

## Series guiadas de cinco intentos

- 11 pruebas web aprobadas y build de producción aprobado. Pruebas nuevas de orden captura/pausa, interrupción por intento inválido y cancelación de temporizadores.
- Navegador con cámara/detector simulados y API real: una serie produce cinco UUID distintos con etiqueta/participante conservados; cancelar en la pausa conserva un intento; perder detección no guarda un intento incompleto ni inicia otra captura.
- Pendiente probar la serie con cámara física. Las pausas requieren que el participante suelte y repita la seña; la aplicación no garantiza independencia ni corrección lingüística.

## Aprender: práctica guiada

- 13 pruebas web, 8 pruebas de API y 5 de entrenamiento aprobadas; build TypeScript/producción aprobado.
- Pruebas nuevas: clasificación del resultado de práctica, rechazo de votos ambiguos, persistencia/idempotencia del historial, aislamiento de perfiles y rechazo de resultados inconsistentes.
- Navegador con cámara, detector y modelo simulados y API real: referencia de letra, coincidencia, candidata diferente, respuesta ambigua, bloqueo de evaluación de letra no soportada, avance, progreso recuperado tras recarga, cero muestras añadidas al practicar y sin desbordamiento horizontal a 390 px. Sin excepciones JavaScript.
- Inspección visual en escritorio. Pendiente prueba con cámara física y evaluación de los umbrales con datos revisados. No se cambió el modelo activo ni se marcaron los datasets del equipo como revisados.
