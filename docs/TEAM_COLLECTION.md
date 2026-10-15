# Recolección con el equipo — seis participantes

Trabajamos sin hosting: cada participante ejecuta su copia local, captura y exporta sus datos. El coordinador importa los archivos y entrena con el conjunto reunido. No es necesario entrenar en cada computadora.

## Acceso y preparación

El repositorio es privado. El coordinador debe dar acceso de lectura a las cuentas GitHub de los compañeros antes de que puedan clonarlo; no compartir credenciales. Los datos y modelos locales no están incluidos en Git.

Requisitos: Git, Node.js 24 (o 22.12+), npm y Python 3.11/3.12. Instalar la misma versión del proyecto; guardar el commit usado para la recolección.

Linux/macOS:

```bash
git clone https://github.com/M4nu3l202400653/senalab.git
cd senalab
npm ci
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run dev
```

Si Python 3.11 está disponible como `python3`, usar ese comando para crear `.venv`.

Windows (PowerShell, con Python 3.11 instalado):

```powershell
git clone https://github.com/M4nu3l202400653/senalab.git
cd senalab
npm ci
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm run dev
```

Abrir la URL de Vite, normalmente `http://127.0.0.1:5173`, en Chrome/Edge. La cámara requiere localhost o HTTPS. Un clon nuevo puede mostrar «No hay un modelo disponible»: es normal y no impide capturar.

## Identidad y sesiones

| Persona | Código de participante |
| --- | --- |
| Coordinador | Conservar su código actual, por ejemplo `persona1` |
| Compañero 1 | `P02` |
| Compañero 2 | `P03` |
| Compañero 3 | `P04` |
| Compañero 4 | `P05` |
| Compañero 5 | `P06` |

El código se mantiene en todas las sesiones de la misma persona, aunque use otra computadora. No usar el mismo código para personas diferentes, ni cambiar el código de una persona para simular participantes nuevos. Estos códigos son anónimos; no escribir nombres completos.

Sesiones sugeridas: `P02-s01`, `P02-s02`, etc. Mantener una sesión distinta por jornada/condición. Los UUID de cada intento se conservan durante exportación e importación.

## Capturar el mismo conjunto

1. Acordar las letras y verificar sus referencias de LENSEGUA antes de comenzar. Como piloto acotado se puede usar A–F; no ampliar cada persona por su cuenta. La lámina actual sigue pendiente de validación.
2. Como meta inicial, reunir **10 intentos por letra en dos sesiones distintas**: 20 por letra/persona. Es una meta de recolección, no una garantía de precisión. Con seis personas y seis letras serían 720 intentos.
3. En Capturar muestras, elegir la letra, ingresar el código y la sesión, aceptar el almacenamiento y activar la cámara.
4. El botón captura cinco intentos de tres segundos con pausas de tres segundos. Soltar/recolocar la mano durante cada pausa para repetir la seña; no mantener la misma postura toda la serie. Dos series por letra en cada una de las dos sesiones completan la meta inicial de 20 intentos. Mantener una sola mano visible, sin dedos fuera del encuadre.
5. Variar moderadamente distancia e iluminación entre sesiones, manteniendo la seña correcta. Usar la misma mano dominante durante una sesión y registrar cualquier cambio de protocolo fuera de la app.
6. Activar Guardar una foto del intento solo si se desea incluir una referencia para revisión. La foto es opcional y no se usa para entrenar.
7. Revisar en Mis muestras → Ver intento y eliminar/repetir capturas incompletas o mal etiquetadas.

La versión actual agrega posiciones por intento; no evalúa la trayectoria de señas dinámicas. No considerar letras con movimiento como resueltas por este modelo estático.

## Entregar los archivos

En Mis muestras, pulsar **Exportar muestras del equipo**. Se exportan todas las muestras visibles en ese perfil. Por defecto se excluyen las fotos para reducir el tamaño; se pueden incluir activando la casilla correspondiente. El archivo contiene puntos, etiquetas, participante, sesión y UUID.

Enviar el JSON al coordinador por el canal acordado del grupo. No hace falta enviar la base SQLite, el modelo ni crear commits con muestras. El nombre incluye el participante si solo hay uno, o `grupo` si se reúnen varios. Se pueden hacer entregas incrementales: los IDs permiten omitir duplicados al importar.

La importación admite hasta 50 MB y 10 000 intentos por archivo. Si se supera el tamaño, exportar sin fotos; si el conjunto sigue siendo muy grande, organizar entregas por lotes antes de acumular tantas muestras. Conservar el respaldo original.

## Trabajo del coordinador

1. Actualizar el código y abrir Mis muestras.
2. Seleccionar uno o varios archivos en **Importar archivos de muestras (.json)**.
3. La aplicación valida cada archivo completo antes de guardarlo. Si un archivo es inválido no se importa parcialmente. Si se seleccionan varios archivos, los anteriores que ya se importaron se conservan aunque uno posterior falle; el mensaje indica cuántos se completaron.
4. Comprobar el número de participantes, letras y muestras. Importar no marca los intentos como revisados ni actualiza el modelo automáticamente.
5. Revisar etiquetas/calidad y pulsar **Entrenar con mis muestras** para una prueba conjunta. Ese botón usa todos los intentos y no mide precisión con personas nuevas.
6. Para evaluación formal, exportar el conjunto consolidado, revisar las etiquetas y usar `training/train.py` sin `--personal`, que separa participantes. Si se ajustan modelos o umbrales, reservar una persona para la prueba final y usar otras para desarrollo/validación; no ajustar mirando la prueba final.

Seis participantes permiten iniciar una evaluación entre personas, pero no prueban que el modelo funcione con toda la población. La partición formal necesita todas las letras seleccionadas en los conjuntos de entrenamiento y prueba.
