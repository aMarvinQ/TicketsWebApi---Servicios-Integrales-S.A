# Documentación — Módulo de Autenticación
**Sistema de Tickets — Servicios Integrales S.A.**

---

## Descripción General

El módulo de autenticación gestiona el acceso al sistema mediante JWT (JSON Web Tokens).
Incluye registro de clientes, inicio de sesión, cierre de sesión y recuperación de contraseña.

---

## Archivos involucrados

| Archivo | Descripción |
|---------|-------------|
| `src/controllers/auth.controller.js` | Lógica de cada endpoint |
| `src/routes/auth.routes.js` | Definición de rutas |
| `src/middlewares/auth.middleware.js` | Verificación de token y roles |
| `src/config/mailer.js` | Configuración de Nodemailer (Gmail) |
| `src/config/emailTemplates.js` | Plantilla HTML del correo de reset |

---

## Endpoints

### `POST /api/auth/register`

Registra un nuevo usuario con rol **cliente**.

**Body:**
```json
{
  "nombre": "Juan",
  "apellido": "Pérez",
  "email": "juan@gmail.com",
  "password": "123456",
  "telefono": "50212345678"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `201` | Usuario registrado correctamente |
| `400` | Campos requeridos faltantes |
| `409` | El email ya está registrado |
| `500` | Error interno del servidor |

**Notas:**
- Solo crea usuarios con rol `cliente`. Los agentes son creados por el admin desde el módulo de usuarios.
- La contraseña se encripta con `bcrypt` (salt rounds: 10) antes de guardarse.

---

### `POST /api/auth/login`

Inicia sesión y retorna un token JWT.

**Body:**
```json
{
  "email": "admin@serviciosintegrales.com",
  "password": "Admin123!"
}
```

**Respuesta exitosa `200`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "usuario": {
    "id": "uuid",
    "nombre": "Administrador",
    "apellido": "Sistema",
    "email": "admin@serviciosintegrales.com",
    "rol": "admin"
  }
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Login exitoso, retorna token y datos del usuario |
| `400` | Email o password faltantes |
| `401` | Credenciales incorrectas |
| `403` | Usuario deshabilitado |
| `500` | Error interno del servidor |

**Notas:**
- El token tiene una duración de `8h` (configurable en `.env` con `JWT_EXPIRES_IN`).
- El token debe enviarse en el header `Authorization: Bearer <token>` en endpoints protegidos.
- Si el usuario tiene `activo = 0` no puede iniciar sesión.

---

### `POST /api/auth/logout`

Cierra la sesión invalidando el token JWT actual.

**Headers:**
```
Authorization: Bearer <token>
```

**Respuesta exitosa `200`:**
```json
{
  "mensaje": "Sesión cerrada correctamente."
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Sesión cerrada correctamente |
| `401` | Token no enviado o ya invalidado |
| `403` | Token inválido o expirado |
| `500` | Error interno del servidor |

**Notas:**
- El token se agrega a la tabla `Token_Blacklist` con su fecha de expiración original.
- Cualquier request posterior con ese token recibirá: `"Sesión cerrada. Inicia sesión nuevamente."`
- El middleware `verificarToken` consulta la blacklist en cada request protegido.

---

### `POST /api/auth/forgot-password`

Solicita un código de 6 dígitos para restablecer la contraseña. El código se envía al correo del usuario.

**Body:**
```json
{
  "email": "juan@gmail.com"
}
```

**Respuesta `200` (siempre la misma por seguridad):**
```json
{
  "mensaje": "Si el correo existe, recibirás un código para restablecer tu contraseña."
}
```

**Notas:**
- La respuesta es siempre genérica para proteger contra enumeración de usuarios (OWASP).
- El código expira en **30 minutos**.
- Si el usuario solicita un nuevo código, los anteriores se invalidan automáticamente (`usado = 1`).
- El correo se envía desde la cuenta configurada en `MAIL_USER` del `.env`.

---

### `POST /api/auth/reset-password`

Restablece la contraseña usando el código recibido por correo.

**Body:**
```json
{
  "email": "juan@gmail.com",
  "token": "123456",
  "password_nuevo": "NuevoPassword123!"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Contraseña restablecida correctamente |
| `400` | Campos faltantes, código inválido o expirado |
| `500` | Error interno del servidor |

**Notas:**
- Verifica que el código no esté usado y no haya expirado.
- Al restablecer exitosamente, el código se marca como `usado = 1`.
- La nueva contraseña se encripta con `bcrypt` antes de guardarse.

---

## Middleware de autenticación

### `verificarToken`

Verifica que el request tenga un token JWT válido y que no esté en la blacklist.

**Uso:**
```js
router.get('/ruta-protegida', verificarToken, controller);
```

**Agrega a `req`:**
- `req.usuario` — payload decodificado del JWT `{ id, email, rol, exp }`
- `req.token` — token JWT crudo (usado en logout)

---

### `soloAdmin`

Permite el acceso únicamente a usuarios con rol `admin`. Debe usarse después de `verificarToken`.

```js
router.delete('/recurso/:id', verificarToken, soloAdmin, controller);
```

---

### `soloAgente`

Permite el acceso a usuarios con rol `agente` o `admin`. Debe usarse después de `verificarToken`.

```js
router.put('/ticket/:id', verificarToken, soloAgente, controller);
```

---

## Flujo completo de autenticación

```
1. REGISTRO
   POST /api/auth/register → crea usuario con rol cliente

2. LOGIN
   POST /api/auth/login → retorna JWT

3. USO DEL TOKEN
   Cualquier endpoint protegido → Authorization: Bearer <token>

4. LOGOUT
   POST /api/auth/logout → invalida el token en blacklist

5. RECUPERAR CONTRASEÑA
   POST /api/auth/forgot-password → envía código al correo
   POST /api/auth/reset-password  → usa el código para cambiar la contraseña
```

---

## Variables de entorno requeridas

| Variable | Descripción |
|----------|-------------|
| `JWT_SECRET` | Clave secreta para firmar los tokens JWT |
| `JWT_EXPIRES_IN` | Duración del token (ej. `8h`, `1d`) |
| `MAIL_USER` | Correo Gmail para envío de emails |
| `MAIL_PASS` | Contraseña de aplicación de Gmail (16 caracteres) |
| `MAIL_FROM` | Nombre y correo del remitente |
