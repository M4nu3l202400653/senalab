# Publicar SeñaLab gratis: Render + Supabase

La web pública incluye Aprender, reconocimiento en el navegador, progreso persistente y recolección de puntos. El entrenamiento y la importación del equipo permanecen en la versión local. En este primer despliegue no se admiten fotografías públicas; no se necesita un bucket de Storage. Solo se utiliza PostgreSQL de Supabase, conservando el presupuesto de su plan gratuito.

El código ya incluye Dockerfile, render.yaml, servidor Flask/Gunicorn y compatibilidad PostgreSQL. El repositorio y la imagen no llevan las muestras, bases locales ni secretos. Publicar el modelo no publica los JSON originales de participantes ni sus fotos.

## 1. Crear cuentas gratuitas

- Supabase: https://supabase.com/dashboard
- Render: https://dashboard.render.com/

Se puede usar GitHub para iniciar sesión. Mantener el plan Free; no hace falta crear una base de datos de Render ni contratar un disco persistente.

## 2. Crear el proyecto Supabase

1. En Supabase, crear una organización gratuita si aún no existe.
2. Crear un proyecto llamado `senalab` y guardar la contraseña de la base de datos.
3. Esperar a que el proyecto esté disponible.
4. Abrir **Connect**, elegir la conexión **URI** y el método **Session pooler**.
5. Copiar la URI mostrada. Debe conservar el usuario `postgres.<identificador>` y el servidor del pooler que te asigne Supabase, normalmente con puerto `5432`.

Usar la URI del pooler para compatibilidad IPv4. No copiar el comando `psql`, la URL pública del proyecto ni una API key. La URI puede contener `[YOUR-PASSWORD]`: la herramienta del siguiente paso pedirá esa contraseña y la codificará correctamente. No pegar contraseñas aquí ni subirlas a GitHub.

Las tablas se crean automáticamente en el esquema `senalab`, con Row Level Security habilitado y sin exponer ese esquema a la Data API. La aplicación accede desde Python con la conexión privada de la base; no hay claves privilegiadas en el frontend.

## 3. Cargar el modelo desde tu computadora

En la carpeta del proyecto:

```bash
git pull
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m server.publish_model --model training/artifacts/hosting/model.json --env-output .env.render
```

La herramienta pide la URI de Session pooler de forma oculta. Si contiene `[YOUR-PASSWORD]`, también pide la contraseña de forma oculta. No se escribe una contraseña en el comando ni en su historial. Se añade SSL cuando la URI no lo especifica.

En la computadora del coordinador ya se preparó `training/artifacts/hosting/model.json` con los 797 intentos aportados por cinco personas, para 27 etiquetas. Es un modelo experimental entrenado con todos los intentos, sin evaluación formal ni revisión lingüística de las etiquetas. Se conserva fuera de Git y no sustituye automáticamente el modelo de la aplicación local. Puedes seleccionar otro `model.json` exportado si deseas publicar un modelo diferente.

El comando:

- Valida el modelo y crea las tablas remotas si no existen.
- Guarda el modelo inicial en Supabase.
- Crea `.env.render` con permisos privados para configurar Render. No sobrescribe ese archivo si ya existe. El archivo contiene un secreto: no se comparte, no se imprime en logs y está ignorado por Git y Docker.

En Windows, usar `.\.venv\Scripts\python.exe` en lugar de `.venv/bin/python`.

Si el modelo no existe en otro clon, entrenarlo primero con un dataset local, por ejemplo:

```bash
.venv/bin/python training/train.py data/mi-dataset.json --labels A,B,C,D,E,F --personal --output training/artifacts/hosting
```

Elegir las etiquetas reales del conjunto. Este modo experimental no mide precisión ni marca datos como revisados.

## 4. Crear el servicio de Render

1. En Render, elegir **New → Web Service**.
2. Conectar GitHub y permitir acceso al repositorio privado `M4nu3l202400653/senalab`.
3. Seleccionar el repositorio y la rama `main`.
4. Configurar:

| Campo | Valor |
| --- | --- |
| Name | `senalab` o un nombre disponible |
| Language / Runtime | `Docker` |
| Root directory | Dejar vacío |
| Dockerfile path | `./Dockerfile` |
| Instance type / Plan | **Free** |
| Health check path | `/api/health` |

5. En **Environment**, usar **Add from .env** e importar el contenido de `.env.render`. Solo debe añadirse `DATABASE_URL`. Si el formulario no permite importar, agregar esa variable manualmente con el valor del archivo, sin el prefijo `DATABASE_URL=`.
6. Crear el servicio y esperar al primer despliegue. Docker compila React e instala Python; Render asigna el puerto automáticamente.
7. Abrir la URL HTTPS que proporcione Render (`https://<nombre>.onrender.com`).

No ejecutar `npm run dev` en Render. El contenedor arranca Gunicorn automáticamente y sirve la web y la API con el mismo dominio. Como alternativa, **New → Blueprint** puede usar `render.yaml`; pedirá el valor de `DATABASE_URL` durante la creación y ya fija el plan Free.

## 5. Verificar

- Abrir `/api/health` en la URL pública: debe mostrar `{"ok":true}`.
- Abrir Aprender y comprobar que aparece el modelo con sus letras.
- Permitir la cámara y probar un intento.
- Recargar y confirmar que se conserva el progreso de ese navegador.
- En Capturar muestras, aportar una serie y comprobar Mis muestras.
- Los botones de entrenamiento/importación deben estar desactivados; la foto pública también.

El modelo se carga automáticamente. No hace falta que cada visitante descargue o suba un JSON. La cámara y el reconocimiento se procesan en el navegador. Los intentos de práctica envían únicamente el resultado para guardar progreso; la captura con consentimiento envía los puntos etiquetados.

Los perfiles aún son anónimos y dependen de un identificador del navegador. No hay cuentas ni recuperación entre dispositivos: borrar ese identificador pierde el acceso automático al perfil anterior. Para el piloto, conservar códigos de participante estables y distintos entre personas; no escribir nombres completos.

## Descargar contribuciones y actualizar el modelo

Solo el coordinador con acceso a la conexión de Supabase:

```bash
.venv/bin/python -m server.download_contributions --output data/aportes-web-2026-10-14.json
```

Usar un nombre nuevo para cada respaldo; no sobrescribe archivos existentes. Pide la conexión de forma oculta. Descarga las muestras de todos los perfiles para su revisión y entrenamiento local, sin incluir los identificadores de acceso al perfil.

Después de revisar/entrenar un modelo nuevo:

```bash
.venv/bin/python -m server.publish_model --model training/artifacts/hosting/model.json
```

Actualiza el modelo inicial sin borrar muestras ni progreso. Los visitantes deben recargar para obtenerlo. No es necesario volver a desplegar Render por cada modelo nuevo. El archivo `.env.render` no se carga automáticamente en tu shell: las herramientas pedirán la conexión otra vez si no existe `DATABASE_URL` en el entorno.

## Límites del piloto gratuito

- Render puede suspender el servicio tras 15 minutos sin tráfico; la primera visita puede tardar alrededor de un minuto en activarlo.
- Supabase Free ofrece 500 MB de base de datos y puede pausarse por baja actividad. Las muestras y el modelo se guardan allí, no en el disco temporal de Render.
- El servidor público limita cada solicitud a 5 MB y 50 capturas, con un cupo de 2000 intentos por perfil y 5000 en total. Exportar/revisar los datos periódicamente y vigilar el uso en Supabase antes de ampliar ese cupo.
- Solo se usan puntos en la recolección pública para limitar el almacenamiento. La versión local conserva las fotos opcionales, la importación y el entrenamiento.

Si el despliegue falla por conexión, comprobar que el proyecto Supabase está activo, que la URI sea la de Session pooler y que se haya sustituido la contraseña correctamente. Si se escribió `.env.render` con un dato incorrecto, corregirlo de forma local y en Render. No publicar el archivo para pedir ayuda.

Referencias oficiales:

- https://render.com/docs/web-services
- https://render.com/docs/blueprint-spec
- https://render.com/docs/configure-environment-variables
- https://render.com/docs/free
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/platform/billing-on-supabase
