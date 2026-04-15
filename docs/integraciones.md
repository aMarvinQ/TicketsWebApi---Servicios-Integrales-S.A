# Documentación — Módulo de Integraciones
**Sistema de Tickets — Servicios Integrales S.A.**

---

## Descripción General

El módulo de integraciones permite recibir tickets desde sistemas externos mediante dos canales:

- **Google Forms** — endpoint protegido por API Key que recibe datos del formulario vía Apps Script
- **Correo electrónico** — listener IMAP que revisa la bandeja de entrada periódicamente y convierte correos en tickets automáticamente

Ambos canales comparten la misma lógica: buscan o crean el cliente por email, asignan agente por menor carga, crean el ticket y envían correos de confirmación.

---

## Archivos involucrados

| Archivo | Descripción |
|---------|-------------|
| `src/controllers/integraciones.controller.js` | Lógica del canal Google Forms |
| `src/routes/integraciones.routes.js` | Definición de rutas |
| `src/middlewares/apiKey.middleware.js` | Verificación de API Key |
| `src/services/emailListener.js` | Listener IMAP para canal email |
| `server.js` | Arranca el listener al iniciar el servidor |

---

## Autenticación

Estos endpoints **no usan JWT**. En su lugar requieren una API Key en el header:

```
x-api-key: <valor-de-INTEGRATION_API_KEY>
```

La clave está definida en el archivo `.env`:
```
INTEGRATION_API_KEY=forms_secret_key_2024
```

Si no se envía el header → **401**. Si la clave es incorrecta → **403**.

---

## Endpoints

---

### `POST /api/integraciones/forms`

Crea un ticket a partir de una respuesta de Google Forms.

**Headers:**
```
x-api-key: forms_secret_key_2024
Content-Type: application/json
```

**Body:**
```json
{
  "titulo": "Mi impresora no funciona",
  "descripcion": "La impresora no enciende desde esta mañana.",
  "nombre_categoria": "Soporte Tecnico",
  "email": "cliente@ejemplo.com",
  "nombre": "Juan",
  "apellido": "Pérez",
  "telefono": "55551234"
}
```

**Campos:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `titulo` | string | Sí | Título del problema |
| `descripcion` | string | Sí | Descripción detallada |
| `nombre_categoria` | string | Sí | Nombre exacto de la categoría (debe existir y estar activa) |
| `email` | string | Sí | Correo del cliente. Si no existe en el sistema se crea automáticamente |
| `nombre` | string | Sí | Nombre del cliente |
| `apellido` | string | Sí | Apellido del cliente |
| `telefono` | string | No | Teléfono del cliente |

**Comportamiento:**

- Si el email **ya existe** → se usa ese usuario como cliente.
- Si el email **no existe** → se crea automáticamente con rol `cliente`. La contraseña temporal es su propio email. Se envía un **email de bienvenida** con sus credenciales de acceso.
- La prioridad se toma de `prioridad_default` de la categoría.
- El agente se asigna automáticamente por menor carga.
- El ticket se registra con `canal = 'forms'`.
- Se envía un **email de confirmación** al cliente con los detalles del ticket creado.

**Respuesta exitosa `201`:**
```json
{
  "mensaje": "Ticket creado correctamente desde Google Forms.",
  "numero_legible": "TKT-00003",
  "prioridad": "critico",
  "agente_asignado": true
}
```

**Respuestas de error:**

| Código | Causa |
|--------|-------|
| `400` | Faltan campos requeridos |
| `400` | La categoría no existe o está deshabilitada |
| `401` | No se envió el header `x-api-key` |
| `403` | La API Key es incorrecta |
| `500` | Error interno del servidor |

---

## Configuración de Google Forms

### Paso 1 — Crear el formulario

Crear un formulario en [Google Forms](https://forms.google.com) con los siguientes campos (los títulos deben coincidir exactamente):

| Título del campo | Tipo | Obligatorio |
|-----------------|------|-------------|
| Título del problema | Respuesta corta | Sí |
| Descripción del problema | Párrafo | Sí |
| Categoría | Desplegable | Sí |
| Correo electrónico | Respuesta corta (validación: email) | Sí |
| Nombre | Respuesta corta | Sí |
| Apellido | Respuesta corta | Sí |
| Teléfono | Respuesta corta | No |

> Las opciones del campo **Categoría** deben coincidir exactamente con los nombres en la base de datos (ej: `Soporte Tecnico`, `Facturacion`, `Ventas`, `General`).

### Paso 2 — Configurar Apps Script

1. Abrir el formulario → **Extensiones → Apps Script**
2. Reemplazar todo el contenido con el siguiente script:

```javascript
function onFormSubmit(e) {
  const API_URL = 'https://TU-URL-PUBLICA/api/integraciones/forms';
  const API_KEY = 'forms_secret_key_2024';

  const itemResponses = e.response.getItemResponses();

  const data = {};
  itemResponses.forEach(item => {
    const clave = item.getItem().getTitle().trim();
    data[clave] = item.getResponse();
  });

  const payload = {
    titulo:           data['Título del problema'] || '',
    descripcion:      data['Descripción del problema'] || '',
    nombre_categoria: data['Categoría'] || '',
    email:            data['Correo electrónico'] || '',
    nombre:           data['Nombre'] || '',
    apellido:         data['Apellido'] || '',
    telefono:         data['Teléfono'] || ''
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': API_KEY,
      'ngrok-skip-browser-warning': 'true'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(API_URL, options);
  Logger.log('Status: ' + response.getResponseCode());
  Logger.log('Respuesta: ' + response.getContentText());
}
```

3. Guardar el script (Ctrl+S)

### Paso 3 — Configurar el Trigger

1. En Apps Script → panel izquierdo → ícono de **Triggers** (reloj)
2. Clic en **"+ Agregar activador"**
3. Configurar:

| Campo | Valor |
|-------|-------|
| Función a ejecutar | `onFormSubmit` |
| Fuente del evento | Desde el formulario |
| Tipo de evento | Al enviar el formulario |
| Notificaciones de falla | Una vez por día |

4. Guardar → aceptar los permisos de Google

### Paso 4 — Publicar el formulario

1. En Google Forms → botón **"Enviar"** (arriba a la derecha)
2. Copiar el enlace generado
3. Compartir ese enlace con los usuarios o incrustarlo en la web

---

## Conectar la API con ngrok (entorno de desarrollo)

ngrok permite exponer el servidor local con una URL pública temporal, necesaria para que Google Apps Script pueda comunicarse con la API durante el desarrollo.

### Instalación

1. Crear cuenta gratuita en [https://ngrok.com](https://ngrok.com)
2. Descargar el ejecutable para Windows
3. Autenticar ngrok con el authtoken de la cuenta:
```bash
ngrok config add-authtoken TU_AUTHTOKEN
```

### Uso

1. Asegurarse de que la API esté corriendo (`npm run dev` o `node src/index.js`)
2. En otra terminal, ejecutar:
```bash
ngrok http 3000
```
3. ngrok mostrará una URL pública similar a:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```
4. Copiar esa URL y reemplazarla en el campo `API_URL` del Apps Script:
```javascript
const API_URL = 'https://abc123.ngrok-free.app/api/integraciones/forms';
```
5. Guardar el script. A partir de ese momento, al enviar el formulario el request llegará a la API local.

### Consideraciones importantes

| Aspecto | Detalle |
|---------|---------|
| La URL cambia | Cada vez que se reinicia ngrok se genera una URL diferente. Hay que actualizar el Apps Script. |
| La sesión expira | En la versión gratuita, la sesión de ngrok expira después de varias horas. |
| Header requerido | ngrok muestra una advertencia HTML al acceder desde scripts externos. Se evita agregando el header `ngrok-skip-browser-warning: true` en la petición (ya incluido en el script). |
| Producción | Para entornos de producción se debe desplegar la API en un servidor con URL fija (Railway, Render, VPS, etc.) y actualizar `API_URL` con esa URL permanente. |

### Verificar que funciona

Después de enviar una respuesta de prueba al formulario:

1. En Apps Script → **Ejecuciones** → abrir la última ejecución de `onFormSubmit`
2. Verificar que los logs muestren `Status: 201`
3. Verificar en la base de datos que el ticket fue creado en la tabla `Tickets`

---

## Canal Email (Listener IMAP)

### Descripción

El listener IMAP se conecta periódicamente a la bandeja de entrada del correo configurado y convierte cada correo no leído en un ticket. No requiere ninguna acción del frontend — opera completamente en el backend.

### Archivos

| Archivo | Descripción |
|---------|-------------|
| `src/services/emailListener.js` | Lógica del listener |
| `server.js` | Llama a `iniciarEmailListener()` al arrancar |

### Variables de entorno

```env
IMAP_USER=tu-correo@gmail.com
IMAP_PASS=xxxx xxxx xxxx xxxx
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
EMAIL_LISTENER_INTERVAL_MS=120000
EMAIL_CATEGORIA_DEFAULT=General
```

| Variable | Descripción |
|----------|-------------|
| `IMAP_USER` | Correo Gmail que recibe los tickets (misma cuenta usada para envío) |
| `IMAP_PASS` | App Password de Gmail (16 caracteres, con espacios) |
| `IMAP_HOST` | Servidor IMAP. Para Gmail siempre `imap.gmail.com` |
| `IMAP_PORT` | Puerto IMAP seguro. Para Gmail siempre `993` |
| `EMAIL_LISTENER_INTERVAL_MS` | Cada cuánto revisa la bandeja en milisegundos. Default: `120000` (2 minutos) |
| `EMAIL_CATEGORIA_DEFAULT` | Nombre de la categoría asignada a todos los tickets por email. Default: `General` |

### Flujo completo

```
Cliente envía correo a la bandeja de la empresa
  └── Cada N segundos el listener revisa correos no leídos
        ├── Parsea: remitente (email + nombre), asunto (título), cuerpo (descripción)
        ├── Busca o crea el cliente por email
        │     └── Si es nuevo → envía email de bienvenida con credenciales
        ├── Asigna categoría default + prioridad_default de esa categoría
        ├── Asigna agente por menor carga
        ├── Crea ticket con canal = 'email'
        ├── Registra en Historial_Tickets (creacion + asignacion)
        ├── Envía email de confirmación al cliente
        └── Marca el correo como leído (no se reprocesa)
```

### Comportamiento detallado

| Aspecto | Detalle |
|---------|---------|
| **Título del ticket** | Asunto del correo |
| **Descripción** | Cuerpo del correo en texto plano (máximo 2000 caracteres) |
| **Categoría** | Siempre la definida en `EMAIL_CATEGORIA_DEFAULT` |
| **Prioridad** | `prioridad_default` de la categoría asignada |
| **Cliente nuevo** | Se crea automáticamente. Contraseña temporal = su email |
| **Email de bienvenida** | Se envía solo si el cliente fue creado en ese momento |
| **Email de confirmación** | Siempre se envía. Indica que el agente se contactará por este mismo correo |
| **Error en un correo** | Se marca como leído y se continúa con el siguiente. El error se loguea en consola |
| **Arranque** | El listener hace una revisión inmediata al iniciar el servidor, luego cada `EMAIL_LISTENER_INTERVAL_MS` ms |

### Configurar IMAP en Gmail

Para que el listener pueda conectarse a Gmail por IMAP:

1. Ir a **Configuración de Gmail → Ver toda la configuración → Reenvío y correo POP/IMAP**
2. En la sección IMAP → activar **"Habilitar IMAP"** → Guardar
3. Usar el **App Password** de la cuenta (el mismo de `MAIL_PASS`) como `IMAP_PASS`

> Si `MAIL_PASS` e `IMAP_PASS` usan la misma cuenta de Gmail, el valor es el mismo App Password.

### Logs en consola

El listener imprime mensajes en consola para seguimiento:

```
[EmailListener] Iniciado. Revisando cada 120s. Categoría default: "General"
[EmailListener] 2 correo(s) no leído(s) encontrado(s).
[EmailListener] Ticket TKT-00005 creado desde correo de cliente@ejemplo.com
[EmailListener] Error de conexión IMAP: ...
```

### Consideraciones

- El correo queda marcado como leído aunque falle la creación del ticket, para evitar bucles de reprocesamiento.
- Si la categoría definida en `EMAIL_CATEGORIA_DEFAULT` no existe o está deshabilitada, el correo se ignora y se loguea una advertencia.
- No hay un endpoint REST para este canal — opera exclusivamente como servicio de fondo.
