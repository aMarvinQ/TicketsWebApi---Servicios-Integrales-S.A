# Documentación de Base de Datos — Sistema de Tickets
**Servicios Integrales, S.A.**
Base de datos: `SistemaTickets`

---

## Descripción General

La base de datos `SistemaTickets` gestiona el ciclo de vida completo de los tickets de soporte
de la empresa Servicios Integrales, S.A. Almacena usuarios (clientes y agentes), tickets de
incidencias, notas de seguimiento, historial de cambios y reglas de asignación automática.

Todos los identificadores primarios usan `UNIQUEIDENTIFIER` (UUID) para garantizar unicidad
global. Todas las tablas (excepto Historial_Tickets) incluyen campos de auditoría.

---

## Campos de Auditoría

Todas las tablas (excepto `Historial_Tickets`) incluyen los siguientes campos estándar:

| Campo           | Tipo              | Descripción                                 |
|-----------------|-------------------|---------------------------------------------|
| `creado_en`     | DATETIME NOT NULL | Fecha y hora de creación del registro       |
| `creado_por`    | UNIQUEIDENTIFIER  | ID del usuario que creó el registro         |
| `actualizado_en`| DATETIME          | Fecha y hora de la última modificación      |
| `actualizado_por`| UNIQUEIDENTIFIER | ID del usuario que realizó la modificación  |

> **Nota:** `creado_por` puede ser NULL en registros del sistema o auto-registros.

---

## Tablas

---

### 1. `Roles`

Define los tipos de usuario disponibles en el sistema.

| Campo          | Tipo              | Descripción                        |
|----------------|-------------------|------------------------------------|
| `id`           | UNIQUEIDENTIFIER  | Identificador único del rol (PK)   |
| `nombre`       | VARCHAR(20)       | Nombre del rol                     |
| `creado_en`    | DATETIME          | Fecha de creación                  |
| `actualizado_en`| DATETIME         | Fecha de última actualización      |

**Valores predefinidos:**

| nombre    | Descripción                                          |
|-----------|------------------------------------------------------|
| `admin`   | Administrador del sistema, acceso total              |
| `agente`  | Técnico de soporte, gestiona y resuelve tickets      |
| `cliente` | Usuario final, crea y consulta sus propios tickets   |

---

### 2. `Usuarios`

Almacena todos los usuarios del sistema: clientes, agentes y administradores.

| Campo           | Tipo              | Nulo | Descripción                                      |
|-----------------|-------------------|------|--------------------------------------------------|
| `id`            | UNIQUEIDENTIFIER  | No   | Identificador único del usuario (PK)             |
| `nombre`        | VARCHAR(100)      | No   | Nombre del usuario                               |
| `apellido`      | VARCHAR(100)      | No   | Apellido del usuario                             |
| `email`         | VARCHAR(150)      | No   | Correo electrónico, único en el sistema          |
| `password`      | VARCHAR(255)      | No   | Contraseña encriptada con bcrypt                 |
| `telefono`      | VARCHAR(20)       | Sí   | Número de teléfono de contacto                   |
| `id_rol`        | UNIQUEIDENTIFIER  | No   | FK → Roles.id                                    |
| `activo`        | BIT               | No   | 1 = activo, 0 = deshabilitado (default: 1)       |
| `creado_en`     | DATETIME          | No   | Fecha de registro                                |
| `creado_por`    | UNIQUEIDENTIFIER  | Sí   | FK → Usuarios.id (NULL en auto-registro)         |
| `actualizado_en`| DATETIME          | Sí   | Fecha de última modificación                     |
| `actualizado_por`| UNIQUEIDENTIFIER | Sí   | FK → Usuarios.id                                 |

**Notas importantes:**
- La contraseña NUNCA se almacena en texto plano, siempre se encripta con `bcrypt`.
- El campo `activo` permite deshabilitar usuarios sin eliminarlos.
- `creado_por` es NULL cuando el usuario se registra a sí mismo.

---

### 3. `Categorias`

Clasifica los tickets según el área de atención de la empresa.

| Campo           | Tipo              | Nulo | Descripción                                  |
|-----------------|-------------------|------|----------------------------------------------|
| `id`            | UNIQUEIDENTIFIER  | No   | Identificador único de la categoría (PK)     |
| `nombre`        | VARCHAR(100)      | No   | Nombre de la categoría                       |
| `descripcion`   | VARCHAR(255)      | Sí   | Descripción del tipo de problemas que cubre  |
| `activo`        | BIT               | No   | 1 = activa, 0 = deshabilitada (default: 1)   |
| `creado_en`     | DATETIME          | No   | Fecha de creación                            |
| `creado_por`    | UNIQUEIDENTIFIER  | Sí   | FK → Usuarios.id                             |
| `actualizado_en`| DATETIME          | Sí   | Fecha de última modificación                 |
| `actualizado_por`| UNIQUEIDENTIFIER | Sí   | FK → Usuarios.id                             |

**Valores predefinidos:**

| nombre            | Descripción                              |
|-------------------|------------------------------------------|
| `Soporte Tecnico` | Problemas técnicos y de sistema          |
| `Ventas`          | Consultas y reclamos sobre ventas        |
| `Facturacion`     | Problemas con facturas y cobros          |
| `General`         | Consultas generales                      |

---

### 4. `Tickets` _(Tabla principal)_

Almacena todos los tickets de soporte generados por los clientes.

| Campo             | Tipo              | Nulo | Descripción                                          |
|-------------------|-------------------|------|------------------------------------------------------|
| `id`              | UNIQUEIDENTIFIER  | No   | Identificador único del ticket (PK)                  |
| `numero_ticket`   | INT               | No   | Número secuencial generado por SEQUENCE              |
| `numero_legible`  | VARCHAR (calculado)| No  | Formato legible: `TKT-00001` (columna calculada)     |
| `titulo`          | VARCHAR(200)      | No   | Título breve del problema                            |
| `descripcion`     | TEXT              | No   | Descripción detallada del problema                   |
| `canal`           | VARCHAR(20)       | No   | Canal de origen del ticket                           |
| `prioridad`       | VARCHAR(10)       | No   | Nivel de urgencia del ticket                         |
| `estado`          | VARCHAR(20)       | No   | Estado actual del ticket (default: `abierto`)        |
| `id_categoria`    | UNIQUEIDENTIFIER  | Sí   | FK → Categorias.id                                   |
| `id_cliente`      | UNIQUEIDENTIFIER  | No   | FK → Usuarios.id (quien creó el ticket)              |
| `id_agente`       | UNIQUEIDENTIFIER  | Sí   | FK → Usuarios.id (agente asignado, NULL si pendiente)|
| `fecha_cierre`    | DATETIME          | Sí   | Fecha en que se cerró el ticket                      |
| `creado_en`       | DATETIME          | No   | Fecha de creación del ticket                         |
| `creado_por`      | UNIQUEIDENTIFIER  | Sí   | FK → Usuarios.id                                     |
| `actualizado_en`  | DATETIME          | Sí   | Fecha de última modificación                         |
| `actualizado_por` | UNIQUEIDENTIFIER  | Sí   | FK → Usuarios.id                                     |

**Valores permitidos por campo:**

| Campo      | Valores permitidos                               |
|------------|--------------------------------------------------|
| `canal`    | `web`, `email`, `chat`, `telefono`               |
| `prioridad`| `critico`, `alto`, `medio`, `bajo`               |
| `estado`   | `abierto`, `en_progreso`, `resuelto`, `cerrado`  |

**Ciclo de vida del estado:**
```
abierto → en_progreso → resuelto → cerrado
```

**Notas importantes:**
- `numero_legible` es una columna calculada, se genera automáticamente, no se inserta manualmente.
- `id_agente` es NULL cuando el ticket aún no ha sido asignado.
- `fecha_cierre` se establece cuando el estado cambia a `cerrado`.

---

### 5. `Notas`

Almacena las notas y respuestas asociadas a cada ticket.

| Campo           | Tipo              | Nulo | Descripción                                        |
|-----------------|-------------------|------|----------------------------------------------------|
| `id`            | UNIQUEIDENTIFIER  | No   | Identificador único de la nota (PK)                |
| `id_ticket`     | UNIQUEIDENTIFIER  | No   | FK → Tickets.id                                    |
| `id_usuario`    | UNIQUEIDENTIFIER  | No   | FK → Usuarios.id (quien escribió la nota)          |
| `contenido`     | TEXT              | No   | Contenido de la nota o respuesta                   |
| `es_interna`    | BIT               | No   | 0 = visible al cliente, 1 = nota interna privada   |
| `creado_en`     | DATETIME          | No   | Fecha de creación                                  |
| `creado_por`    | UNIQUEIDENTIFIER  | Sí   | FK → Usuarios.id                                   |
| `actualizado_en`| DATETIME          | Sí   | Fecha de última modificación                       |
| `actualizado_por`| UNIQUEIDENTIFIER | Sí   | FK → Usuarios.id                                   |

**Campo `es_interna`:**
- `0` — Respuesta visible para el cliente (comunicación oficial)
- `1` — Nota interna, solo visible para agentes y administradores

---

### 6. `Historial_Tickets`

Registra cronológicamente todos los eventos ocurridos en un ticket.

| Campo       | Tipo              | Nulo | Descripción                                      |
|-------------|-------------------|------|--------------------------------------------------|
| `id`        | UNIQUEIDENTIFIER  | No   | Identificador único del registro (PK)            |
| `id_ticket` | UNIQUEIDENTIFIER  | No   | FK → Tickets.id                                  |
| `id_usuario`| UNIQUEIDENTIFIER  | No   | FK → Usuarios.id (quien realizó la acción)       |
| `accion`    | VARCHAR(50)       | No   | Tipo de acción registrada                        |
| `detalle`   | VARCHAR(255)      | Sí   | Descripción del cambio realizado                 |
| `creado_en` | DATETIME          | No   | Fecha y hora exacta del evento                   |

**Valores permitidos en `accion`:**

| Valor           | Cuándo se registra                              |
|-----------------|-------------------------------------------------|
| `creacion`      | Al crear el ticket                              |
| `asignacion`    | Al asignar o reasignar un agente                |
| `cambio_estado` | Al cambiar el estado del ticket                 |
| `nota_agregada` | Al agregar una nota o respuesta                 |
| `cierre`        | Al cerrar el ticket definitivamente             |

> **Importante:** Esta tabla es de solo escritura. Los registros nunca se modifican ni eliminan,
> garantizando la integridad del historial de auditoría.

---

### 7. `Reglas_Asignacion`

Define las reglas para la asignación automática de tickets a agentes.

| Campo           | Tipo              | Nulo | Descripción                                          |
|-----------------|-------------------|------|------------------------------------------------------|
| `id`            | UNIQUEIDENTIFIER  | No   | Identificador único de la regla (PK)                 |
| `id_categoria`  | UNIQUEIDENTIFIER  | Sí   | FK → Categorias.id (NULL = aplica a cualquier cat.)  |
| `prioridad`     | VARCHAR(10)       | Sí   | Prioridad del ticket (NULL = aplica a cualquier una) |
| `id_agente`     | UNIQUEIDENTIFIER  | No   | FK → Usuarios.id (agente a asignar)                  |
| `activo`        | BIT               | No   | 1 = regla activa, 0 = deshabilitada (default: 1)     |
| `creado_en`     | DATETIME          | No   | Fecha de creación                                    |
| `creado_por`    | UNIQUEIDENTIFIER  | Sí   | FK → Usuarios.id                                     |
| `actualizado_en`| DATETIME          | Sí   | Fecha de última modificación                         |
| `actualizado_por`| UNIQUEIDENTIFIER | Sí   | FK → Usuarios.id                                     |

**Lógica de asignación automática:**
```
Al crear un ticket:
  1. Buscar regla donde id_categoria = ticket.id_categoria
                    AND prioridad    = ticket.prioridad
                    AND activo       = 1
  2. Si encuentra → asignar ticket.id_agente = regla.id_agente
  3. Si no encuentra → ticket queda sin agente (asignación manual)
```

---

### 8. `Password_Reset_Tokens`

Almacena los tokens temporales de 6 dígitos para restablecer contraseñas.

| Campo        | Tipo             | Nulo | Descripción                                         |
|--------------|------------------|------|-----------------------------------------------------|
| `id`         | UNIQUEIDENTIFIER | No   | Identificador único del token (PK)                  |
| `id_usuario` | UNIQUEIDENTIFIER | No   | FK → Usuarios.id                                    |
| `token`      | VARCHAR(255)     | No   | Código de 6 dígitos enviado al correo               |
| `expira_en`  | DATETIME         | No   | Fecha de expiración (30 minutos desde su creación)  |
| `usado`      | BIT              | No   | 0 = vigente, 1 = ya utilizado (default: 0)          |
| `creado_en`  | DATETIME         | No   | Fecha de creación                                   |

**Notas importantes:**
- Al solicitar un nuevo token, todos los tokens anteriores del usuario se marcan como `usado = 1`.
- Al usar el token exitosamente se marca como `usado = 1`.
- El token expira en 30 minutos independientemente de si fue usado.
- La respuesta del endpoint es siempre genérica para no revelar si el email existe (protección contra enumeración de usuarios).

---

### 9. `Token_Blacklist`

Almacena los tokens JWT invalidados por logout para impedir su reutilización.

| Campo       | Tipo             | Nulo | Descripción                                       |
|-------------|------------------|------|---------------------------------------------------|
| `id`        | UNIQUEIDENTIFIER | No   | Identificador único del registro (PK)             |
| `token`     | VARCHAR(500)     | No   | Token JWT completo invalidado                     |
| `expira_en` | DATETIME         | No   | Fecha de expiración original del JWT              |
| `creado_en` | DATETIME         | No   | Fecha en que se cerró la sesión                   |

**Notas importantes:**
- Cada request verificado por `verificarToken` consulta esta tabla.
- `expira_en` se toma directamente del claim `exp` del JWT.
- Los tokens expirados en esta tabla pueden limpiarse periódicamente sin afectar la seguridad.

---

## Relaciones entre tablas

```
Roles ──────────────── Usuarios ──── Password_Reset_Tokens
                          │
              ┌───────────┼────────────┐
              │           │            │
           Tickets    Notas     Reglas_Asignacion
              │
       ┌──────┴──────┐
       │             │
    Notas    Historial_Tickets

Token_Blacklist  (tabla independiente, sin FK)
```

**Relaciones detalladas:**

| Tabla origen              | Campo FK         | Tabla destino | Descripción                               |
|---------------------------|------------------|---------------|-------------------------------------------|
| `Usuarios`                | `id_rol`         | `Roles`       | Un usuario tiene un rol                   |
| `Tickets`                 | `id_cliente`     | `Usuarios`    | Un ticket pertenece a un cliente          |
| `Tickets`                 | `id_agente`      | `Usuarios`    | Un ticket puede estar asignado a un agente|
| `Tickets`                 | `id_categoria`   | `Categorias`  | Un ticket pertenece a una categoría       |
| `Notas`                   | `id_ticket`      | `Tickets`     | Una nota pertenece a un ticket            |
| `Notas`                   | `id_usuario`     | `Usuarios`    | Una nota fue escrita por un usuario       |
| `Historial_Tickets`       | `id_ticket`      | `Tickets`     | Un evento pertenece a un ticket           |
| `Historial_Tickets`       | `id_usuario`     | `Usuarios`    | Un evento fue generado por un usuario     |
| `Reglas_Asignacion`       | `id_categoria`   | `Categorias`  | La regla aplica a una categoría           |
| `Reglas_Asignacion`       | `id_agente`      | `Usuarios`    | La regla asigna a un agente               |
| `Password_Reset_Tokens`   | `id_usuario`     | `Usuarios`    | El token pertenece a un usuario           |

---

## Ejemplos de uso

### Crear un ticket
```sql
INSERT INTO Tickets (id, titulo, descripcion, canal, prioridad, id_categoria, id_cliente, creado_por)
VALUES (
    NEWID(),
    'No puedo acceder al sistema',
    'Desde esta mañana el sistema no me permite iniciar sesión.',
    'web',
    'alto',
    'id-categoria-soporte-tecnico',
    'id-del-cliente',
    'id-del-cliente'
);
```

### Consultar tickets abiertos con sus datos completos
```sql
SELECT
    t.numero_legible,
    t.titulo,
    t.prioridad,
    t.estado,
    t.canal,
    c.nombre  AS categoria,
    u1.nombre + ' ' + u1.apellido AS cliente,
    u2.nombre + ' ' + u2.apellido AS agente,
    t.creado_en
FROM Tickets t
INNER JOIN Categorias c  ON c.id = t.id_categoria
INNER JOIN Usuarios   u1 ON u1.id = t.id_cliente
LEFT  JOIN Usuarios   u2 ON u2.id = t.id_agente
WHERE t.estado = 'abierto'
ORDER BY
    CASE t.prioridad
        WHEN 'critico' THEN 1
        WHEN 'alto'    THEN 2
        WHEN 'medio'   THEN 3
        WHEN 'bajo'    THEN 4
    END;
```

### Ver el historial completo de un ticket
```sql
SELECT
    h.accion,
    h.detalle,
    u.nombre + ' ' + u.apellido AS realizado_por,
    h.creado_en
FROM Historial_Tickets h
INNER JOIN Usuarios u ON u.id = h.id_usuario
WHERE h.id_ticket = 'id-del-ticket'
ORDER BY h.creado_en ASC;
```

### Ver notas de un ticket (solo las públicas para el cliente)
```sql
SELECT
    n.contenido,
    u.nombre + ' ' + u.apellido AS autor,
    n.creado_en
FROM Notas n
INNER JOIN Usuarios u ON u.id = n.id_usuario
WHERE n.id_ticket   = 'id-del-ticket'
  AND n.es_interna  = 0
ORDER BY n.creado_en ASC;
```

### Buscar regla de asignación automática
```sql
SELECT id_agente
FROM Reglas_Asignacion
WHERE id_categoria = 'id-categoria'
  AND prioridad    = 'critico'
  AND activo       = 1;
```

### Cambiar estado de un ticket y registrar en historial
```sql
-- 1. Actualizar el ticket
UPDATE Tickets
SET estado          = 'en_progreso',
    actualizado_en  = GETDATE(),
    actualizado_por = 'id-del-agente'
WHERE id = 'id-del-ticket';

-- 2. Registrar en historial
INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
VALUES (
    NEWID(),
    'id-del-ticket',
    'id-del-agente',
    'cambio_estado',
    'Estado cambiado de abierto a en_progreso'
);
```
