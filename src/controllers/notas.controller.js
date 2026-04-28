const { getConnection, sql } = require('../config/db');
const { enviarCorreo } = require('../config/mailer');
const { nuevaRespuestaTemplate } = require('../config/emailTemplates');

// =============================================
// HELPER — verificar acceso al ticket
// =============================================

const verificarAccesoTicket = async (pool, id_ticket, id_usuario, rol) => {
  const result = await pool.request()
    .input('id', sql.UniqueIdentifier, id_ticket)
    .query('SELECT id, id_cliente, id_agente FROM Tickets WHERE id = @id');

  if (result.recordset.length === 0) return { error: 404, mensaje: 'Ticket no encontrado.' };

  const ticket = result.recordset[0];

  if (rol === 'cliente' && ticket.id_cliente !== id_usuario) {
    return { error: 403, mensaje: 'No tienes acceso a este ticket.' };
  }
  if (rol === 'agente' && ticket.id_agente !== id_usuario) {
    return { error: 403, mensaje: 'No tienes acceso a este ticket.' };
  }

  return { ticket };
};

// =============================================
// AGREGAR NOTA
// =============================================

const agregarNota = async (req, res) => {
  const { id: id_ticket } = req.params;
  const { contenido, es_interna = false } = req.body;
  const { id: id_usuario, rol } = req.usuario;

  if (!contenido || !contenido.trim()) {
    return res.status(400).json({ mensaje: 'El contenido de la nota es requerido.' });
  }

  // Clientes solo pueden crear notas públicas
  const esInterna = rol === 'cliente' ? false : !!es_interna;

  try {
    const pool   = await getConnection();
    const acceso = await verificarAccesoTicket(pool, id_ticket, id_usuario, rol);
    if (acceso.error) return res.status(acceso.error).json({ mensaje: acceso.mensaje });

    const nuevaNota = await pool.request()
      .input('id_ticket',   sql.UniqueIdentifier, id_ticket)
      .input('id_usuario',  sql.UniqueIdentifier, id_usuario)
      .input('contenido',   sql.Text,             contenido.trim())
      .input('es_interna',  sql.Bit,              esInterna ? 1 : 0)
      .input('creado_por',  sql.UniqueIdentifier, id_usuario)
      .query(`
        INSERT INTO Notas (id, id_ticket, id_usuario, contenido, es_interna, creado_por)
        OUTPUT INSERTED.id, INSERTED.creado_en
        VALUES (NEWID(), @id_ticket, @id_usuario, @contenido, @es_interna, @creado_por)
      `);

    const nota = nuevaNota.recordset[0];

    // Registrar en historial
    await pool.request()
      .input('id_ticket',  sql.UniqueIdentifier, id_ticket)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .input('detalle',    sql.VarChar, esInterna ? 'Nota interna agregada' : 'Respuesta pública agregada')
      .query(`
        INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
        VALUES (NEWID(), @id_ticket, @id_usuario, 'nota_agregada', @detalle)
      `);

    // Actualizar fecha de modificación del ticket
    await pool.request()
      .input('id_ticket',  sql.UniqueIdentifier, id_ticket)
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .query(`
        UPDATE Tickets
        SET actualizado_en  = GETDATE(),
            actualizado_por = @id_usuario
        WHERE id = @id_ticket
      `);

    // Notificar al cliente por email solo si la nota es pública y la escribió un agente/admin
    if (!esInterna && rol !== 'cliente') {
      try {
        const clienteData = await pool.request()
          .input('id_ticket', sql.UniqueIdentifier, id_ticket)
          .query(`
            SELECT u.nombre, u.email, t.titulo, t.numero_legible
            FROM Tickets t
            INNER JOIN Usuarios u ON u.id = t.id_cliente
            WHERE t.id = @id_ticket
          `);

        const autorData = await pool.request()
          .input('id_usuario', sql.UniqueIdentifier, id_usuario)
          .query('SELECT nombre, apellido FROM Usuarios WHERE id = @id_usuario');

        if (clienteData.recordset.length > 0) {
          const { nombre, email, titulo, numero_legible } = clienteData.recordset[0];
          const autorRow = autorData.recordset[0];
          const autor = `${autorRow.nombre} ${autorRow.apellido}`;

          await enviarCorreo({
            para:   email,
            asunto: `Nueva respuesta en tu ticket ${numero_legible} — Servicios Integrales S.A.`,
            html:   nuevaRespuestaTemplate({ nombre, numero_legible, titulo, contenido: contenido.trim(), autor }),
          });
        }
      } catch (mailError) {
        console.error('Error al enviar notificación de nueva respuesta:', mailError);
      }
    }

    res.status(201).json({
      mensaje:    esInterna ? 'Nota interna agregada.' : 'Respuesta agregada correctamente.',
      id:         nota.id,
      es_interna: esInterna,
      creado_en:  nota.creado_en,
    });
  } catch (error) {
    console.error('Error en agregarNota:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// LISTAR NOTAS
// =============================================

const listarNotas = async (req, res) => {
  const { id: id_ticket } = req.params;
  const { id: id_usuario, rol } = req.usuario;

  try {
    const pool   = await getConnection();
    const acceso = await verificarAccesoTicket(pool, id_ticket, id_usuario, rol);
    if (acceso.error) return res.status(acceso.error).json({ mensaje: acceso.mensaje });

    const request = pool.request().input('id_ticket', sql.UniqueIdentifier, id_ticket);

    // Clientes solo ven notas públicas
    let whereInterna = '';
    if (rol === 'cliente') {
      whereInterna = 'AND n.es_interna = 0';
    }

    const result = await request.query(`
      SELECT
        n.id, n.contenido, n.es_interna, n.creado_en,
        u.nombre + ' ' + u.apellido AS autor,
        u.email AS autor_email,
        r.nombre AS autor_rol
      FROM Notas n
      INNER JOIN Usuarios u ON u.id = n.id_usuario
      INNER JOIN Roles    r ON r.id = u.id_rol
      WHERE n.id_ticket = @id_ticket ${whereInterna}
      ORDER BY n.creado_en ASC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error en listarNotas:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// HISTORIAL DEL TICKET
// =============================================

const listarHistorial = async (req, res) => {
  const { id: id_ticket } = req.params;
  const { id: id_usuario, rol } = req.usuario;

  try {
    const pool   = await getConnection();
    const acceso = await verificarAccesoTicket(pool, id_ticket, id_usuario, rol);
    if (acceso.error) return res.status(acceso.error).json({ mensaje: acceso.mensaje });

    const filtroInterna = rol === 'cliente'
      ? "AND NOT (h.accion = 'nota_agregada' AND h.detalle = 'Nota interna agregada')"
      : '';

    const result = await pool.request()
      .input('id_ticket', sql.UniqueIdentifier, id_ticket)
      .query(`
        SELECT
          h.id, h.accion, h.detalle, h.creado_en,
          u.nombre + ' ' + u.apellido AS realizado_por,
          r.nombre AS rol
        FROM Historial_Tickets h
        INNER JOIN Usuarios u ON u.id = h.id_usuario
        INNER JOIN Roles    r ON r.id = u.id_rol
        WHERE h.id_ticket = @id_ticket ${filtroInterna}
        ORDER BY h.creado_en ASC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Error en listarHistorial:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { agregarNota, listarNotas, listarHistorial };
