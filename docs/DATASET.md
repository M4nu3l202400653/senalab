# Protocolo de muestras

La imagen de referencia sirve para enseñar y verificar una etiqueta. Unas pocas ilustraciones de internet no sustituyen datos de cámara de varias personas. Verificar LENSEGUA, fuente y permiso antes de incluir material en el catálogo.

1. Validar la letra con una persona competente; confirmar si necesita movimiento.
2. Usar un código estable de participante (sin nombre) y una sesión distinta por jornada/condición. No cambiar el código de una persona para simular nuevos participantes.
3. Mostrar una sola mano, dentro del encuadre, con iluminación suficiente. La vista es espejo; las coordenadas se guardan sin reflejar.
4. Capturar tres segundos por intento. El capturador requiere al menos 20 cuadros y dos segundos entre el primero y el último. Verificar manualmente pausas, cambios de mano y pérdidas del detector antes de aprobar.
5. Repetir en sesiones y condiciones distintas; evitar cientos de cuadros consecutivos como sustituto de personas distintas.
6. Las muestras se guardan automáticamente en SQLite en el servidor de la aplicación. Conservar respaldos de la base fuera del repositorio. Los códigos de participante y los puntos deben tratarse con cuidado.
7. Para evaluación formal por CLI, un revisor debe verificar cada intento antes de cambiar `reviewed` de `false` a `true` en una copia del JSON. Sin video guardado, la revisión puede hacerse observando la captura presencialmente y anotando su ID. Si no hay evidencia suficiente, repetir el intento.

Formato: `schemaVersion: 1`, `language: LENSEGUA`, `samples[]` con ID, etiqueta, participante, sesión, fecha, revisión y cuadros. Cada cuadro contiene `t` (milisegundos relativos al inicio), `landmarks` (21 objetos x/y/z) y `handedness` (salida del detector, no validación de dominancia). No se guardan imágenes ni audio.

La normalización resta la muñeca y divide por la mayor distancia euclidiana de los puntos a la muñeca. Conserva orientación. El baseline calcula la mediana de los 63 valores a lo largo de un intento; pierde la trayectoria y por eso no admite letras dinámicas. No hay un filtro automático que valide la lengua ni la etiqueta.

## Referencias por integrar

Registrar por letra: fuente original, autor/entidad, licencia o permiso, enlace al archivo, fecha de revisión, revisor, estática/dinámica y variantes. No publicar referencias sin validar.

- CONADI, recursos LENSEGUA: https://conadi.gob.gt/web/lensegua/
- ASEDES, entidad educativa con instructores sordos: https://www.asedesguatemala.org/
- Detector: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js

## Entrenamiento personal desde la web

El botón Entrenar con mis muestras usa las etiquetas del usuario sin revisión y guarda el modelo en el servidor. Este modo no mide precisión ni cambia `reviewed`. Requiere al menos dos clases y usa todos los intentos del perfil. No sustituye el protocolo de revisión para evaluación formal. Los nuevos intentos no actualizan el modelo automáticamente: hay que volver a entrenar.
