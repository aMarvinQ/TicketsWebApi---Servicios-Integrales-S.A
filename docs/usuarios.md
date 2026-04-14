# Documentación — Módulo de Usuarios
**Sistema de Tickets — Servicios Integrales S.A.**

---

## Descripción General

El módulo de usuarios gestiona los perfiles, credenciales y administración de todos los usuarios
del sistema. Está dividido en dos grupos de endpoints: acciones sobre el **perfil propio**
(cualquier usuario autenticado) y **gestión de usuarios** (exclusivo para administradores).

---

## Archivos involucrados

| Archivo | Descripción |
|---------|-------------|
| `src/controllers/usuarios.controller.js` | Lógica de cada endpoint |
| `src/routes/usuarios.routes.js` | Definición de rutas y permisos |

---

## Permisos por endpoint

| Endpoint | Rol requerido |
|----------|--------------|
| `GET /perfil` | Cualquier usuario autenticado |
| `PUT /perfil` | Cualquier usuario autenticado |
| `PUT /perfil/cambiar-password` | Cualquier usuario autenticado |
| `GET /agentes` | Cualquier usuario autenticado |
| `GET /` | Solo admin |
| `GET /:id` | Solo admin |
| `POST /` | Solo admin |
| `PUT /:id` | Solo admin |
| `PUT /:id/reset-password` | Solo admin |
| `PUT /:id/toggle-activo` | Solo admin |

> Todos los endpoints requieren el header `Authorization: Bearer <token>`.

---

## Endpoints — Perfil propio

---

### `GET /api/usuarios/perfil`

Retorna los datos del usuario autenticado.

**Headers:**
```
Authorization: Bearer <token>
```

**Respuesta exitosa `200`:**
```json
{
  "id": "uuid",
  "nombre": "Juan",
  "apellido": "Pérez",
  "email": "juan@gmail.com",
  "telefono": "50240001111",
  "activo": true,
  "rol": "cliente",
  "creado_en": "2026-04-14T10:00:00.000Z"
}
```

---

### `PUT /api/usuarios/perfil`

Actualiza los datos del perfil del usuario autenticado. Solo permite modificar `nombre`, `apellido` y `telefono`. El email y el rol no pueden cambiarse desde aquí.

**Headers:**
```
Authorization: Bearer <token>
```

**Body (todos opcionales, mínimo uno):**
```json
{
  "nombre": "Juan Carlos",
  "apellido": "Pérez López",
  "telefono": "50299998888"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Perfil actualizado correctamente |
| `400` | No se envió ningún campo |
| `500` | Error interno del servidor |

---

### `PUT /api/usuarios/perfil/cambiar-password`

Permite al usuario autenticado cambiar su propia contraseña. Requiere confirmar la contraseña actual.

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
  "password_actual": "1234",
  "password_nuevo": "NuevoPassword123!"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Contraseña actualizada correctamente |
| `400` | Campos requeridos faltantes |
| `401` | La contraseña actual es incorrecta |
| `500` | Error interno del servidor |

**Notas:**
- La nueva contraseña se encripta con `bcrypt` antes de guardarse.
- A diferencia del reset por admin, este endpoint **sí requiere** la contraseña actual.

---

## Endpoints — Gestión de usuarios (Admin)

---

### `GET /api/usuarios`

Lista todos los usuarios del sistema con soporte de filtros, búsqueda y paginación.

**Headers:**
```
Authorization: Bearer <token>
```

**Query params (todos opcionales):**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `rol` | string | — | Filtrar por rol: `admin`, `agente`, `cliente` |
| `activo` | boolean | — | Filtrar por estado: `true` o `false` |
| `search` | string | — | Buscar por nombre, apellido o email |
| `page` | number | `1` | Página actual |
| `limit` | number | `10` | Registros por página |

**Ejemplos de uso:**
```
GET /api/usuarios
GET /api/usuarios?rol=agente
GET /api/usuarios?activo=true
GET /api/usuarios?search=carlos
GET /api/usuarios?rol=cliente&activo=true&page=1&limit=5
GET /api/usuarios?search=gmail&page=2&limit=10
```

**Respuesta exitosa `200`:**
```json
{
  "datos": [
    {
      "id": "uuid",
      "nombre": "Carlos",
      "apellido": "Mendoza",
      "email": "carlos.mendoza@serviciosintegrales.com",
      "telefono": "50230001111",
      "activo": true,
      "rol": "agente",
      "creado_en": "2026-04-14T10:00:00.000Z"
    }
  ],
  "paginacion": {
    "total": 6,
    "pagina": 1,
    "limit": 10,
    "paginas": 1
  }
}
```

**Uso desde el frontend:**
```js
// Dropdown de límite: 5, 10, 15, 20
const limit = 10; // valor del dropdown
const page  = 1;  // página actual

fetch(`/api/usuarios?limit=${limit}&page=${page}&rol=agente`, {
  headers: { Authorization: `Bearer ${token}` }
});

// Con paginacion.paginas sabes cuántos botones de página mostrar
// Con paginacion.total puedes mostrar "Mostrando 1-10 de 6 usuarios"
```

---

### `GET /api/usuarios/:id`

Retorna los datos de un usuario específico.

**Params:**
- `id` — UUID del usuario

**Respuesta exitosa `200`:**
```json
{
  "id": "uuid",
  "nombre": "Carlos",
  "apellido": "Mendoza",
  "email": "carlos.mendoza@serviciosintegrales.com",
  "telefono": "50230001111",
  "activo": true,
  "rol": "agente",
  "creado_en": "2026-04-14T10:00:00.000Z",
  "actualizado_en": "2026-04-14T12:00:00.000Z"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Datos del usuario |
| `404` | Usuario no encontrado |
| `500` | Error interno del servidor |

---

### `POST /api/usuarios`

Crea un nuevo usuario con rol `agente` o `admin`. Los clientes se registran ellos mismos desde `/api/auth/register`.

**Body:**
```json
{
  "nombre": "Ana",
  "apellido": "García",
  "email": "ana.garcia@serviciosintegrales.com",
  "password": "1234",
  "telefono": "50230002222",
  "rol": "agente"
}
```

**Campos requeridos:** `nombre`, `apellido`, `email`, `password`, `rol`
**Roles permitidos:** `agente`, `admin`

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `201` | Usuario creado correctamente |
| `400` | Campos faltantes o rol no permitido |
| `409` | El email ya está registrado |
| `500` | Error interno del servidor |

---

### `PUT /api/usuarios/:id`

Actualiza los datos de un usuario. El admin puede cambiar nombre, apellido, teléfono y rol.

**Params:**
- `id` — UUID del usuario

**Body (todos opcionales, mínimo uno):**
```json
{
  "nombre": "Ana María",
  "apellido": "García López",
  "telefono": "50299990000",
  "rol": "admin"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Usuario actualizado correctamente |
| `400` | No se envió ningún campo o rol inválido |
| `404` | Usuario no encontrado |
| `500` | Error interno del servidor |

---

### `PUT /api/usuarios/:id/reset-password`

El admin restablece la contraseña de cualquier usuario **sin necesitar la contraseña actual**.

**Params:**
- `id` — UUID del usuario

**Body:**
```json
{
  "password_nuevo": "1234"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Contraseña restablecida correctamente |
| `400` | `password_nuevo` faltante |
| `404` | Usuario no encontrado |
| `500` | Error interno del servidor |

**Notas:**
- A diferencia de `cambiar-password`, este endpoint **no requiere** la contraseña actual.
- La nueva contraseña se encripta con `bcrypt` antes de guardarse.

---

### `PUT /api/usuarios/:id/toggle-activo`

Habilita o deshabilita un usuario. Si está activo lo desactiva, y viceversa.

**Params:**
- `id` — UUID del usuario

**Sin body.** El estado se invierte automáticamente.

**Respuesta exitosa `200`:**
```json
{ "mensaje": "Usuario deshabilitado correctamente." }
// o
{ "mensaje": "Usuario habilitado correctamente." }
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Estado cambiado correctamente |
| `404` | Usuario no encontrado |
| `500` | Error interno del servidor |

**Notas:**
- Un usuario deshabilitado (`activo = 0`) no puede iniciar sesión.
- Esta es la forma correcta de "eliminar" usuarios — nunca se borran físicamente.

---

## Endpoints — Consulta de Agentes

---

### `GET /api/usuarios/agentes`

Lista todos los agentes activos. Disponible para cualquier usuario autenticado. Usado principalmente para poblar dropdowns de asignación de tickets.

**Respuesta exitosa `200`:**
```json
[
  {
    "id": "uuid",
    "nombre": "Carlos",
    "apellido": "Mendoza",
    "email": "carlos.mendoza@serviciosintegrales.com",
    "telefono": "50230001111"
  }
]
```

---

## Resumen de diferencias clave

| Acción | Endpoint | Quién |
|--------|----------|-------|
| Ver mi perfil | `GET /perfil` | Yo mismo |
| Editar mi perfil | `PUT /perfil` | Yo mismo |
| Cambiar mi password | `PUT /perfil/cambiar-password` | Yo mismo (requiere password actual) |
| Resetear password de otro | `PUT /:id/reset-password` | Solo admin (no requiere password actual) |
| Crear agentes/admins | `POST /` | Solo admin |
| Registrarse como cliente | `POST /api/auth/register` | Público |
| Deshabilitar usuario | `PUT /:id/toggle-activo` | Solo admin |
