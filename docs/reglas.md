# Documentación — Módulo de Reglas de Asignación
**Sistema de Tickets — Servicios Integrales S.A.**

---

## Descripción General

El módulo de reglas de asignación permite configurar la asignación automática de tickets a
agentes. Cuando un cliente crea un ticket, el sistema busca una regla activa que coincida con
la categoría y prioridad del ticket, y asigna automáticamente al agente con menor carga de
trabajo en ese momento.

---

## Archivos involucrados

| Archivo | Descripción |
|---------|-------------|
| `src/controllers/reglas.controller.js` | Lógica de cada endpoint y función de asignación automática |
| `src/routes/reglas.routes.js` | Definición de rutas (todas exclusivas del admin) |

---

## Permisos

Todos los endpoints de este módulo son **exclusivos del administrador**.

> Requieren el header `Authorization: Bearer <token>` con token de rol `admin`.

---

## Lógica de asignación automática — Menor carga

Cuando se crea un ticket, el sistema ejecuta la función `obtenerAgentePorMenorCarga`:

```
1. Buscar todos los agentes con regla activa para:
      id_categoria = ticket.id_categoria
   AND prioridad   = ticket.prioridad
   AND activo      = 1

2. Para cada agente encontrado, contar sus tickets activos
   (estado = 'abierto' o 'en_progreso')

3. Ordenar agentes de menor a mayor carga

4. Asignar el ticket al agente con menos tickets activos

5. En caso de empate → asignar al primero encontrado (orden alfabético)

6. Si no existe ninguna regla → ticket queda sin agente (id_agente = NULL)
   para asignación manual posterior
```

### Ejemplo práctico

El admin configura estas reglas para **Soporte Técnico + crítico**:

| Agente | Regla | Tickets activos actuales |
|--------|-------|--------------------------|
| Carlos | Soporte Técnico + crítico | 5 |
| Ana    | Soporte Técnico + crítico | 2 |
| Luis   | Soporte Técnico + crítico | 3 |

Llega un nuevo ticket de Soporte Técnico + crítico → se asigna a **Ana** (menor carga: 2).

---

## Validaciones

| Validación | Descripción |
|------------|-------------|
| Categoría activa | Solo se pueden crear reglas para categorías con `activo = 1` |
| Rol agente | El usuario asignado debe tener rol `agente` y estar activo |
| Sin duplicados por agente | No puede existir dos reglas con la misma combinación de `id_categoria + prioridad + id_agente` |
| Múltiples agentes permitidos | Sí pueden existir varias reglas con la misma `id_categoria + prioridad` apuntando a **diferentes** agentes |

---

## Endpoints

---

### `GET /api/reglas`

Lista todas las reglas de asignación con filtros y paginación. Incluye la carga actual de tickets activos de cada agente.

**Query params (todos opcionales):**

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `activo` | boolean | — | Filtrar por estado: `true` o `false` |
| `id_categoria` | UUID | — | Filtrar por categoría |
| `prioridad` | string | — | Filtrar por prioridad: `critico`, `alto`, `medio`, `bajo` |
| `page` | number | `1` | Página actual |
| `limit` | number | `10` | Registros por página |

**Ejemplos:**
```
GET /api/reglas
GET /api/reglas?prioridad=critico
GET /api/reglas?id_categoria=uuid&activo=true
GET /api/reglas?prioridad=alto&page=1&limit=5
```

**Respuesta exitosa `200`:**
```json
{
  "datos": [
    {
      "id": "uuid",
      "prioridad": "critico",
      "activo": true,
      "creado_en": "2026-04-14T10:00:00.000Z",
      "categoria": "Soporte Tecnico",
      "agente": "Carlos Mendoza",
      "agente_email": "carlos.mendoza@serviciosintegrales.com",
      "tickets_activos": 3
    }
  ],
  "paginacion": {
    "total": 5,
    "pagina": 1,
    "limit": 10,
    "paginas": 1
  }
}
```

> `tickets_activos` muestra en tiempo real cuántos tickets activos tiene el agente, útil para que el admin monitoree la carga del equipo.

---

### `GET /api/reglas/:id`

Retorna los datos de una regla específica.

**Params:**
- `id` — UUID de la regla

**Respuesta exitosa `200`:**
```json
{
  "id": "uuid",
  "prioridad": "critico",
  "activo": true,
  "creado_en": "2026-04-14T10:00:00.000Z",
  "actualizado_en": null,
  "id_categoria": "uuid",
  "categoria": "Soporte Tecnico",
  "id_agente": "uuid",
  "agente": "Carlos Mendoza",
  "agente_email": "carlos.mendoza@serviciosintegrales.com"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Datos de la regla |
| `404` | Regla no encontrada |
| `500` | Error interno del servidor |

---

### `POST /api/reglas`

Crea una nueva regla de asignación.

**Body:**
```json
{
  "id_categoria": "uuid-categoria",
  "prioridad": "critico",
  "id_agente": "uuid-agente"
}
```

**Campos requeridos:** `id_categoria`, `prioridad`, `id_agente`

**Valores válidos para `prioridad`:** `critico`, `alto`, `medio`, `bajo`

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `201` | Regla creada correctamente |
| `400` | Campos faltantes, prioridad inválida, categoría inactiva o agente inválido |
| `409` | Ya existe una regla para ese agente con esa categoría y prioridad |
| `500` | Error interno del servidor |

---

### `PUT /api/reglas/:id`

Actualiza una regla existente.

**Params:**
- `id` — UUID de la regla

**Body (todos opcionales, mínimo uno):**
```json
{
  "id_categoria": "uuid-nueva-categoria",
  "prioridad": "alto",
  "id_agente": "uuid-nuevo-agente"
}
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Regla actualizada correctamente |
| `400` | Sin campos, prioridad inválida o agente inválido |
| `404` | Regla no encontrada |
| `409` | La combinación actualizada ya existe para ese agente |
| `500` | Error interno del servidor |

---

### `PUT /api/reglas/:id/toggle-activo`

Habilita o deshabilita una regla sin eliminarla. Una regla deshabilitada no se considera en la asignación automática.

**Params:**
- `id` — UUID de la regla

**Sin body.**

**Respuesta exitosa `200`:**
```json
{ "mensaje": "Regla deshabilitada correctamente." }
// o
{ "mensaje": "Regla habilitada correctamente." }
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Estado cambiado correctamente |
| `404` | Regla no encontrada |
| `500` | Error interno del servidor |

**Cuándo usar `toggle-activo` vs `DELETE`:**
- Usa `toggle-activo` cuando quieras pausar temporalmente una regla (vacaciones del agente, turno, etc.)
- Usa `DELETE` cuando la regla ya no tenga sentido y no vaya a volver a usarse

---

### `DELETE /api/reglas/:id`

Elimina permanentemente una regla de asignación.

**Params:**
- `id` — UUID de la regla

**Sin body.**

**Respuesta exitosa `200`:**
```json
{ "mensaje": "Regla eliminada correctamente." }
```

**Respuestas:**

| Status | Descripción |
|--------|-------------|
| `200` | Regla eliminada correctamente |
| `404` | Regla no encontrada |
| `500` | Error interno del servidor |

**Notas:**
- Es el único módulo con eliminación física, ya que las reglas no tienen impacto histórico.
- Los tickets ya asignados **no se ven afectados** al eliminar una regla.

---

## Relación con otros módulos

| Módulo | Relación |
|--------|----------|
| `Categorias` | La regla referencia una categoría — debe existir y estar activa |
| `Usuarios` | El agente de la regla debe tener rol `agente` y estar activo |
| `Tickets` | Al crear un ticket se invoca `obtenerAgentePorMenorCarga` para asignación automática |

---

## Flujo completo de asignación automática

```
Admin configura reglas:
  Soporte Técnico + crítico → Carlos, Ana, Luis

Cliente crea ticket:
  Categoría: Soporte Técnico
  Prioridad: crítico

Sistema ejecuta obtenerAgentePorMenorCarga:
  Carlos → 5 tickets activos
  Ana    → 2 tickets activos  ← menor carga
  Luis   → 3 tickets activos

Resultado: ticket asignado automáticamente a Ana
           Historial registra: "Asignado automáticamente por menor carga"
```
