const { getConnection, sql } = require('../config/db');
const { obtenerAgentePorMenorCarga } = require('./reglas.controller');
const { enviarCorreo } = require('../config/mailer');
const { ticketCreadoTemplate } = require('../config/emailTemplates');

// =============================================
// CREAR TICKET
// =============================================

const crearTicket = async (req, res) => {
  const { titulo, descripcion, id_categoria, canal, prioridad: prioridad_manual, id_agente: id_agente_manual } = req.body;
  const { id: id_usuario, rol } = req.usuario;

  // Validaciones básicas
  if (!titulo || !descripcion || !id_categoria || !canal) {
    return res.status(400).json({ mensaje: 'titulo, descripcion, id_categoria y canal son requeridos.' });
  }

  const canalesValidos = ['web', 'chat', 'email', 'forms', 'telefono', 'presencial'];
  if (!canalesValidos.includes(canal)) {
    return res.status(400).json({ mensaje: `Canal no válido. Use: ${canalesValidos.join(', ')}.` });
  }

  // Clientes solo pueden crear tickets por web o chat
  if (rol === 'cliente' && !['web', 'chat'].includes(canal)) {
    return res.status(403).json({ mensaje: 'Los clientes solo pueden crear tickets por web o chat.' });
  }

  try {
    const pool = await getConnection();

    // Obtener categoría y su prioridad_default
    const categoriaResult = await pool.request()
      .input('id_categoria', sql.UniqueIdentifier, id_categoria)
      .query('SELECT id, nombre, prioridad_default FROM Categorias WHERE id = @id_categoria AND activo = 1');

    if (categoriaResult.recordset.length === 0) {
      return res.status(400).json({ mensaje: 'La categoría no existe o está deshabilitada.' });
    }

    // Prioridad: agente/admin pueden especificarla, cliente siempre usa la de la categoría
    const prioridadesValidas = ['critico', 'alto', 'medio', 'bajo'];
    const nombre_categoria = categoriaResult.recordset[0].nombre;
    let prioridad = categoriaResult.recordset[0].prioridad_default;

    if (prioridad_manual && rol !== 'cliente') {
      if (!prioridadesValidas.includes(prioridad_manual)) {
        return res.status(400).json({ mensaje: 'Prioridad no válida. Use: critico, alto, medio, bajo.' });
      }
      prioridad = prioridad_manual;
    }

    // Determinar el id_cliente
    // Si es cliente → él mismo
    // Si es agente o admin → id_cliente es obligatorio en el body
    let id_cliente;
    if (rol === 'cliente') {
      id_cliente = id_usuario;
    } else {
      if (!req.body.id_cliente) {
        return res.status(400).json({ mensaje: 'id_cliente es requerido cuando el ticket lo crea un agente o admin.' });
      }
      id_cliente = req.body.id_cliente;
    }

    // Verificar que el cliente exista
    if (id_cliente !== id_usuario) {
      const clienteResult = await pool.request()
        .input('id_cliente', sql.UniqueIdentifier, id_cliente)
        .query(`
          SELECT u.id FROM Usuarios u
          INNER JOIN Roles r ON r.id = u.id_rol
          WHERE u.id = @id_cliente AND r.nombre = 'cliente' AND u.activo = 1
        `);

      if (clienteResult.recordset.length === 0) {
        return res.status(400).json({ mensaje: 'El cliente no existe o no tiene rol cliente.' });
      }
    }

    // Determinar el agente asignado
    let id_agente = null;

    if (id_agente_manual && rol !== 'cliente') {
      // Admin o agente especificó el agente manualmente
      const agenteResult = await pool.request()
        .input('id_agente', sql.UniqueIdentifier, id_agente_manual)
        .query(`
          SELECT u.id FROM Usuarios u
          INNER JOIN Roles r ON r.id = u.id_rol
          WHERE u.id = @id_agente AND r.nombre = 'agente' AND u.activo = 1
        `);

      if (agenteResult.recordset.length === 0) {
        return res.status(400).json({ mensaje: 'El agente no existe o no tiene rol agente.' });
      }

      id_agente = id_agente_manual;
    } else {
      // Asignación automática por menor carga
      id_agente = await obtenerAgentePorMenorCarga(pool, id_categoria, prioridad);
    }

    // Crear el ticket
    const ticketResult = await pool.request()
      .input('titulo', sql.VarChar, titulo)
      .input('descripcion', sql.Text, descripcion)
      .input('canal', sql.VarChar, canal)
      .input('prioridad', sql.VarChar, prioridad)
      .input('id_categoria', sql.UniqueIdentifier, id_categoria)
      .input('id_cliente', sql.UniqueIdentifier, id_cliente)
      .input('id_agente', sql.UniqueIdentifier, id_agente)
      .input('creado_por', sql.UniqueIdentifier, id_usuario)
      .query(`
        INSERT INTO Tickets (id, titulo, descripcion, canal, prioridad, id_categoria, id_cliente, id_agente, creado_por)
        OUTPUT INSERTED.id, INSERTED.numero_legible
        VALUES (NEWID(), @titulo, @descripcion, @canal, @prioridad, @id_categoria, @id_cliente, @id_agente, @creado_por)
      `);

    const ticket = ticketResult.recordset[0];

    // Registrar creación en historial
    await pool.request()
      .input('id_ticket', sql.UniqueIdentifier, ticket.id)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .query(`
        INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
        VALUES (NEWID(), @id_ticket, @id_usuario, 'creacion', 'Ticket creado')
      `);

    // Registrar asignación en historial si se asignó agente
    if (id_agente) {
      const detalle = id_agente_manual
        ? 'Agente asignado manualmente'
        : 'Agente asignado automáticamente por menor carga';

      await pool.request()
        .input('id_ticket', sql.UniqueIdentifier, ticket.id)
        .input('id_usuario', sql.UniqueIdentifier, id_usuario)
        .input('detalle', sql.VarChar, detalle)
        .query(`
          INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
          VALUES (NEWID(), @id_ticket, @id_usuario, 'asignacion', @detalle)
        `);
    }

    // Enviar email de confirmación al cliente
    try {
      const clienteData = await pool.request()
        .input('id_cliente', sql.UniqueIdentifier, id_cliente)
        .query('SELECT nombre, email FROM Usuarios WHERE id = @id_cliente');

      if (clienteData.recordset.length > 0) {
        const { nombre, email } = clienteData.recordset[0];
        await enviarCorreo({
          para: email,
          asunto: `Ticket ${ticket.numero_legible} registrado — Servicios Integrales S.A.`,
          html: ticketCreadoTemplate({
            nombre,
            numero_legible: ticket.numero_legible,
            titulo,
            descripcion,
            categoria: nombre_categoria,
            agente_asignado: !!id_agente,
          }),
        });
      }
    } catch (mailError) {
      console.error('Error al enviar email de confirmación de ticket:', mailError);
    }

    res.status(201).json({
      mensaje: 'Ticket creado correctamente.',
      id: ticket.id,
      numero_legible: ticket.numero_legible,
      prioridad,
      asignado_automaticamente: !!id_agente && !id_agente_manual,
      agente_asignado: !!id_agente,
    });
  } catch (error) {
    console.error('Error en crearTicket:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// LISTAR TICKETS
// =============================================

const listarTickets = async (req, res) => {
  const { id: id_usuario, rol } = req.usuario;
  const { estado, prioridad, canal, id_categoria, id_cliente, id_agente: id_agente_filtro, buscar, buscar_cliente, buscar_agente, page = 1, limit = 10 } = req.query;

  try {
    const pool     = await getConnection();
    const offset   = (parseInt(page) - 1) * parseInt(limit);
    const request  = pool.request();
    const rCount   = pool.request();

    let where = 'WHERE 1=1';

    // Ocultar tickets marcados como ocultos, salvo que se filtre explícitamente por cerrado
    if (estado !== 'cerrado') {
      where += ' AND t.oculto = 0';
    }

    // Visibilidad por rol
    if (rol === 'cliente') {
      where += ' AND t.id_cliente = @id_usuario';
      request.input('id_usuario', sql.UniqueIdentifier, id_usuario);
      rCount.input('id_usuario', sql.UniqueIdentifier, id_usuario);
    } else if (rol === 'agente') {
      where += ' AND t.id_agente = @id_usuario';
      request.input('id_usuario', sql.UniqueIdentifier, id_usuario);
      rCount.input('id_usuario', sql.UniqueIdentifier, id_usuario);
    }
    // admin ve todos, sin filtro adicional

    if (estado) {
      where += ' AND t.estado = @estado';
      request.input('estado', sql.VarChar, estado);
      rCount.input('estado', sql.VarChar, estado);
    }
    if (prioridad) {
      where += ' AND t.prioridad = @prioridad';
      request.input('prioridad', sql.VarChar, prioridad);
      rCount.input('prioridad', sql.VarChar, prioridad);
    }
    if (canal) {
      where += ' AND t.canal = @canal';
      request.input('canal', sql.VarChar, canal);
      rCount.input('canal', sql.VarChar, canal);
    }
    if (id_categoria) {
      where += ' AND t.id_categoria = @id_categoria';
      request.input('id_categoria', sql.UniqueIdentifier, id_categoria);
      rCount.input('id_categoria', sql.UniqueIdentifier, id_categoria);
    }
    // Filtro por cliente — solo agente y admin (cliente siempre ve sus propios tickets)
    if (id_cliente && rol !== 'cliente') {
      where += ' AND t.id_cliente = @id_cliente';
      request.input('id_cliente', sql.UniqueIdentifier, id_cliente);
      rCount.input('id_cliente', sql.UniqueIdentifier, id_cliente);
    }
    // Filtro por agente — solo admin (agente ya está limitado a sus propios tickets)
    if (id_agente_filtro && rol === 'admin') {
      where += ' AND t.id_agente = @id_agente_filtro';
      request.input('id_agente_filtro', sql.UniqueIdentifier, id_agente_filtro);
      rCount.input('id_agente_filtro', sql.UniqueIdentifier, id_agente_filtro);
    }
    if (buscar) {
      where += ' AND (t.titulo LIKE @buscar OR t.numero_legible LIKE @buscar)';
      request.input('buscar', sql.VarChar, `%${buscar}%`);
      rCount.input('buscar', sql.VarChar, `%${buscar}%`);
    }
    // Búsqueda por nombre/apellido del cliente — agente y admin
    if (buscar_cliente && rol !== 'cliente') {
      where += ' AND (uc.nombre LIKE @buscar_cliente OR uc.apellido LIKE @buscar_cliente OR uc.email LIKE @buscar_cliente)';
      request.input('buscar_cliente', sql.VarChar, `%${buscar_cliente}%`);
      rCount.input('buscar_cliente', sql.VarChar, `%${buscar_cliente}%`);
    }
    // Búsqueda por nombre/apellido del agente — solo admin
    if (buscar_agente && rol === 'admin') {
      where += ' AND (ua.nombre LIKE @buscar_agente OR ua.apellido LIKE @buscar_agente OR ua.email LIKE @buscar_agente)';
      request.input('buscar_agente', sql.VarChar, `%${buscar_agente}%`);
      rCount.input('buscar_agente', sql.VarChar, `%${buscar_agente}%`);
    }

    const totalResult = await rCount.query(`
      SELECT COUNT(*) AS total
      FROM Tickets t
      LEFT JOIN Usuarios uc ON uc.id = t.id_cliente
      LEFT JOIN Usuarios ua ON ua.id = t.id_agente
      ${where}
    `);
    const total = totalResult.recordset[0].total;

    request.input('limit',  sql.Int, parseInt(limit));
    request.input('offset', sql.Int, offset);

    const result = await request.query(`
      SELECT
        t.id, t.numero_legible, t.titulo, t.estado, t.prioridad, t.canal,
        t.creado_en, t.fecha_cierre,
        t.id_categoria, t.id_agente,
        c.nombre  AS categoria,
        uc.nombre + ' ' + uc.apellido AS cliente,
        uc.email  AS cliente_email,
        ISNULL(ua.nombre + ' ' + ua.apellido, 'Sin asignar') AS agente
      FROM Tickets t
      LEFT JOIN Categorias c  ON c.id  = t.id_categoria
      LEFT JOIN Usuarios   uc ON uc.id = t.id_cliente
      LEFT JOIN Usuarios   ua ON ua.id = t.id_agente
      ${where}
      ORDER BY
        CASE t.prioridad
          WHEN 'critico' THEN 1
          WHEN 'alto'    THEN 2
          WHEN 'medio'   THEN 3
          WHEN 'bajo'    THEN 4
        END,
        t.creado_en DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      datos: result.recordset,
      paginacion: {
        total,
        pagina:  parseInt(page),
        limit:   parseInt(limit),
        paginas: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error en listarTickets:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// DETALLE DE TICKET
// =============================================

const obtenerTicket = async (req, res) => {
  const { id } = req.params;
  const { id: id_usuario, rol } = req.usuario;

  try {
    const pool   = await getConnection();
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(`
        SELECT
          t.id, t.numero_legible, t.titulo, t.descripcion, t.estado,
          t.prioridad, t.canal, t.creado_en, t.actualizado_en, t.fecha_cierre,
          t.id_cliente, t.id_agente, t.id_categoria,
          c.nombre  AS categoria,
          uc.nombre AS cliente_nombre, uc.apellido AS cliente_apellido, uc.email AS cliente_email,
          ISNULL(ua.nombre, 'Sin asignar') AS agente_nombre,
          ISNULL(ua.apellido, '')          AS agente_apellido,
          ua.email  AS agente_email
        FROM Tickets t
        LEFT JOIN Categorias c  ON c.id  = t.id_categoria
        LEFT JOIN Usuarios   uc ON uc.id = t.id_cliente
        LEFT JOIN Usuarios   ua ON ua.id = t.id_agente
        WHERE t.id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Ticket no encontrado.' });
    }

    const ticket = result.recordset[0];

    // Verificar visibilidad
    if (rol === 'cliente' && ticket.id_cliente !== id_usuario) {
      return res.status(403).json({ mensaje: 'No tienes acceso a este ticket.' });
    }
    if (rol === 'agente' && ticket.id_agente !== id_usuario) {
      return res.status(403).json({ mensaje: 'No tienes acceso a este ticket.' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error en obtenerTicket:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// CAMBIAR ESTADO
// =============================================

const cambiarEstado = async (req, res) => {
  const { id }       = req.params;
  const { estado }   = req.body;
  const { id: id_usuario } = req.usuario;

  const estadosValidos = ['abierto', 'en_progreso', 'resuelto', 'cerrado'];
  if (!estado || !estadosValidos.includes(estado)) {
    return res.status(400).json({ mensaje: `estado no válido. Use: ${estadosValidos.join(', ')}.` });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id, estado FROM Tickets WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Ticket no encontrado.' });
    }

    const estadoAnterior = existe.recordset[0].estado;
    if (estadoAnterior === estado) {
      return res.status(400).json({ mensaje: `El ticket ya se encuentra en estado "${estado}".` });
    }

    const esCierre = estado === 'cerrado';

    await pool.request()
      .input('id',           sql.UniqueIdentifier, id)
      .input('estado',       sql.VarChar,          estado)
      .input('id_usuario',   sql.UniqueIdentifier, id_usuario)
      .input('fecha_cierre', sql.DateTime,         esCierre ? new Date() : null)
      .query(`
        UPDATE Tickets
        SET estado          = @estado,
            fecha_cierre    = CASE WHEN @estado = 'cerrado' THEN @fecha_cierre ELSE fecha_cierre END,
            actualizado_en  = GETDATE(),
            actualizado_por = @id_usuario
        WHERE id = @id
      `);

    await pool.request()
      .input('id_ticket',  sql.UniqueIdentifier, id)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .input('detalle',    sql.VarChar, `Estado cambiado de "${estadoAnterior}" a "${estado}"`)
      .query(`
        INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
        VALUES (NEWID(), @id_ticket, @id_usuario, 'cambio_estado', @detalle)
      `);

    res.json({ mensaje: `Estado actualizado a "${estado}" correctamente.` });
  } catch (error) {
    console.error('Error en cambiarEstado:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// REASIGNAR AGENTE
// =============================================

const asignarAgente = async (req, res) => {
  const { id }         = req.params;
  const { id_agente }  = req.body;
  const { id: id_usuario } = req.usuario;

  if (!id_agente) {
    return res.status(400).json({ mensaje: 'id_agente es requerido.' });
  }

  try {
    const pool = await getConnection();

    const ticketResult = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id FROM Tickets WHERE id = @id');

    if (ticketResult.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Ticket no encontrado.' });
    }

    const agenteResult = await pool.request()
      .input('id_agente', sql.UniqueIdentifier, id_agente)
      .query(`
        SELECT u.id FROM Usuarios u
        INNER JOIN Roles r ON r.id = u.id_rol
        WHERE u.id = @id_agente AND r.nombre = 'agente' AND u.activo = 1
      `);

    if (agenteResult.recordset.length === 0) {
      return res.status(400).json({ mensaje: 'El agente no existe o no tiene rol agente.' });
    }

    await pool.request()
      .input('id',         sql.UniqueIdentifier, id)
      .input('id_agente',  sql.UniqueIdentifier, id_agente)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .query(`
        UPDATE Tickets
        SET id_agente       = @id_agente,
            actualizado_en  = GETDATE(),
            actualizado_por = @id_usuario
        WHERE id = @id
      `);

    await pool.request()
      .input('id_ticket',  sql.UniqueIdentifier, id)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .query(`
        INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
        VALUES (NEWID(), @id_ticket, @id_usuario, 'asignacion', 'Agente reasignado manualmente')
      `);

    res.json({ mensaje: 'Agente asignado correctamente.' });
  } catch (error) {
    console.error('Error en asignarAgente:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// CAMBIAR PRIORIDAD
// =============================================

const cambiarPrioridad = async (req, res) => {
  const { id }        = req.params;
  const { prioridad } = req.body;
  const { id: id_usuario } = req.usuario;

  const prioridadesValidas = ['critico', 'alto', 'medio', 'bajo'];
  if (!prioridad || !prioridadesValidas.includes(prioridad)) {
    return res.status(400).json({ mensaje: `prioridad no válida. Use: ${prioridadesValidas.join(', ')}.` });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id, prioridad FROM Tickets WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Ticket no encontrado.' });
    }

    const prioridadAnterior = existe.recordset[0].prioridad;
    if (prioridadAnterior === prioridad) {
      return res.status(400).json({ mensaje: `El ticket ya tiene prioridad "${prioridad}".` });
    }

    await pool.request()
      .input('id',         sql.UniqueIdentifier, id)
      .input('prioridad',  sql.VarChar,          prioridad)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .query(`
        UPDATE Tickets
        SET prioridad       = @prioridad,
            actualizado_en  = GETDATE(),
            actualizado_por = @id_usuario
        WHERE id = @id
      `);

    await pool.request()
      .input('id_ticket',  sql.UniqueIdentifier, id)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .input('detalle',    sql.VarChar, `Prioridad cambiada de "${prioridadAnterior}" a "${prioridad}"`)
      .query(`
        INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
        VALUES (NEWID(), @id_ticket, @id_usuario, 'cambio_estado', @detalle)
      `);

    res.json({ mensaje: `Prioridad actualizada a "${prioridad}" correctamente.` });
  } catch (error) {
    console.error('Error en cambiarPrioridad:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// ACTUALIZAR TICKET (campos individuales o combinados)
// =============================================

const actualizarTicket = async (req, res) => {
  const { id } = req.params;
  const { id: id_usuario } = req.usuario;
  const { estado, prioridad, id_agente, id_categoria } = req.body;

  if (!estado && !prioridad && !id_agente && !id_categoria) {
    return res.status(400).json({ mensaje: 'Envía al menos un campo: estado, prioridad, id_agente o id_categoria.' });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id, estado, prioridad FROM Tickets WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Ticket no encontrado.' });
    }

    const actual = existe.recordset[0];
    const setClauses = [];
    const historial  = [];
    const req_       = pool.request()
      .input('id',         sql.UniqueIdentifier, id)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario);

    if (estado) {
      const estadosValidos = ['abierto', 'en_progreso', 'resuelto', 'cerrado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ mensaje: `estado no válido. Use: ${estadosValidos.join(', ')}.` });
      }
      setClauses.push('estado = @estado');
      if (estado === 'cerrado') setClauses.push('fecha_cierre = GETDATE()');
      req_.input('estado', sql.VarChar, estado);
      historial.push({ accion: 'cambio_estado', detalle: `Estado cambiado de "${actual.estado}" a "${estado}"` });
    }

    if (prioridad) {
      const prioridadesValidas = ['critico', 'alto', 'medio', 'bajo'];
      if (!prioridadesValidas.includes(prioridad)) {
        return res.status(400).json({ mensaje: `prioridad no válida. Use: ${prioridadesValidas.join(', ')}.` });
      }
      setClauses.push('prioridad = @prioridad');
      req_.input('prioridad', sql.VarChar, prioridad);
      historial.push({ accion: 'cambio_estado', detalle: `Prioridad cambiada de "${actual.prioridad}" a "${prioridad}"` });
    }

    if (id_agente) {
      const agenteResult = await pool.request()
        .input('id_agente', sql.UniqueIdentifier, id_agente)
        .query(`
          SELECT u.id FROM Usuarios u
          INNER JOIN Roles r ON r.id = u.id_rol
          WHERE u.id = @id_agente AND r.nombre = 'agente' AND u.activo = 1
        `);
      if (agenteResult.recordset.length === 0) {
        return res.status(400).json({ mensaje: 'El agente no existe o no tiene rol agente.' });
      }
      setClauses.push('id_agente = @id_agente');
      req_.input('id_agente', sql.UniqueIdentifier, id_agente);
      historial.push({ accion: 'asignacion', detalle: 'Agente reasignado manualmente' });
    }

    if (id_categoria) {
      const catResult = await pool.request()
        .input('id_categoria', sql.UniqueIdentifier, id_categoria)
        .query('SELECT id FROM Categorias WHERE id = @id_categoria AND activo = 1');
      if (catResult.recordset.length === 0) {
        return res.status(400).json({ mensaje: 'La categoría no existe o está deshabilitada.' });
      }
      setClauses.push('id_categoria = @id_categoria');
      req_.input('id_categoria', sql.UniqueIdentifier, id_categoria);
    }

    setClauses.push('actualizado_en = GETDATE()', 'actualizado_por = @id_usuario');

    await req_.query(`UPDATE Tickets SET ${setClauses.join(', ')} WHERE id = @id`);

    for (const h of historial) {
      await pool.request()
        .input('id_ticket',  sql.UniqueIdentifier, id)
        .input('id_usuario', sql.UniqueIdentifier, id_usuario)
        .input('accion',     sql.VarChar, h.accion)
        .input('detalle',    sql.VarChar, h.detalle)
        .query(`
          INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
          VALUES (NEWID(), @id_ticket, @id_usuario, @accion, @detalle)
        `);
    }

    res.json({ mensaje: 'Ticket actualizado correctamente.' });
  } catch (error) {
    console.error('Error en actualizarTicket:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// OCULTAR TICKET
// =============================================

const ocultarTicket = async (req, res) => {
  const { id } = req.params;
  const { id: id_usuario, rol } = req.usuario;

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id, id_cliente, id_agente, estado FROM Tickets WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Ticket no encontrado.' });
    }

    const ticket = existe.recordset[0];

    if (rol === 'cliente' && ticket.id_cliente !== id_usuario) {
      return res.status(403).json({ mensaje: 'No tienes acceso a este ticket.' });
    }
    if (rol === 'agente' && ticket.id_agente !== id_usuario) {
      return res.status(403).json({ mensaje: 'No tienes acceso a este ticket.' });
    }

    await pool.request()
      .input('id',         sql.UniqueIdentifier, id)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .query(`
        UPDATE Tickets
        SET oculto          = 1,
            actualizado_en  = GETDATE(),
            actualizado_por = @id_usuario
        WHERE id = @id
      `);

    res.json({ mensaje: 'Ticket ocultado correctamente.' });
  } catch (error) {
    console.error('Error en ocultarTicket:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { crearTicket, listarTickets, obtenerTicket, cambiarEstado, asignarAgente, cambiarPrioridad, ocultarTicket, actualizarTicket };
