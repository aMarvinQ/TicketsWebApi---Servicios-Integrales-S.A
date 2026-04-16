const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const bcrypt = require('bcryptjs');
const { getConnection, sql } = require('../config/db');
const { obtenerAgentePorMenorCarga } = require('../controllers/reglas.controller');
const { enviarCorreo } = require('../config/mailer');
const { bienvenidaClienteTemplate, ticketCreadoTemplate } = require('../config/emailTemplates');
require('dotenv').config();

const INTERVALO_MS        = parseInt(process.env.EMAIL_LISTENER_INTERVAL_MS) || 120000;
const CATEGORIA_DEFAULT   = process.env.EMAIL_CATEGORIA_DEFAULT || 'General';

// =============================================
// PROCESAR UN CORREO Y CREAR TICKET
// =============================================

const procesarCorreo = async (pool, parsed) => {
  const fromAddress = parsed.from?.value?.[0];
  if (!fromAddress) return;

  const email    = fromAddress.address?.toLowerCase();
  const nombre   = fromAddress.name?.split(' ')[0] || 'Cliente';
  const apellido = fromAddress.name?.split(' ').slice(1).join(' ') || '';
  const titulo   = parsed.subject?.trim() || 'Sin asunto';

  // Obtener texto plano del cuerpo, eliminando espacios excesivos
  const descripcion = (parsed.text || parsed.html?.replace(/<[^>]+>/g, '') || '').trim().slice(0, 2000) || titulo;

  if (!email) return;

  // Buscar categoría default
  const categoriaResult = await pool.request()
    .input('nombre', sql.VarChar, CATEGORIA_DEFAULT)
    .query('SELECT id, prioridad_default FROM Categorias WHERE nombre = @nombre AND activo = 1');

  if (categoriaResult.recordset.length === 0) {
    console.warn(`[EmailListener] Categoría default "${CATEGORIA_DEFAULT}" no encontrada. Correo ignorado.`);
    return;
  }

  const id_categoria = categoriaResult.recordset[0].id;
  const prioridad    = categoriaResult.recordset[0].prioridad_default;

  // Buscar o crear cliente
  let id_cliente;
  let esNuevoCliente = false;

  const usuarioResult = await pool.request()
    .input('email', sql.VarChar, email)
    .query('SELECT id FROM Usuarios WHERE email = @email');

  if (usuarioResult.recordset.length > 0) {
    id_cliente = usuarioResult.recordset[0].id;
  } else {
    const rolResult = await pool.request()
      .input('nombre', sql.VarChar, 'cliente')
      .query('SELECT id FROM Roles WHERE nombre = @nombre');

    const id_rol   = rolResult.recordset[0].id;
    const password = await bcrypt.hash(email, 10);

    const nuevoUsuario = await pool.request()
      .input('nombre',   sql.VarChar,        nombre)
      .input('apellido', sql.VarChar,        apellido || 'Sin apellido')
      .input('email',    sql.VarChar,        email)
      .input('password', sql.VarChar,        password)
      .input('id_rol',   sql.UniqueIdentifier, id_rol)
      .query(`
        INSERT INTO Usuarios (id, nombre, apellido, email, password, id_rol)
        OUTPUT INSERTED.id
        VALUES (NEWID(), @nombre, @apellido, @email, @password, @id_rol)
      `);

    id_cliente    = nuevoUsuario.recordset[0].id;
    esNuevoCliente = true;

    try {
      await enviarCorreo({
        para:   email,
        asunto: 'Bienvenido al Sistema de Tickets — Servicios Integrales S.A.',
        html:   bienvenidaClienteTemplate({ nombre, email, password: email }),
      });
    } catch (err) {
      console.error('[EmailListener] Error al enviar email de bienvenida:', err.message);
    }
  }

  // Asignar agente por menor carga
  const id_agente = await obtenerAgentePorMenorCarga(pool, id_categoria, prioridad);

  // Crear ticket
  const ticketResult = await pool.request()
    .input('titulo',       sql.VarChar,        titulo)
    .input('descripcion',  sql.Text,           descripcion)
    .input('prioridad',    sql.VarChar,        prioridad)
    .input('id_categoria', sql.UniqueIdentifier, id_categoria)
    .input('id_cliente',   sql.UniqueIdentifier, id_cliente)
    .input('id_agente',    sql.UniqueIdentifier, id_agente)
    .input('creado_por',   sql.UniqueIdentifier, id_cliente)
    .query(`
      INSERT INTO Tickets (id, titulo, descripcion, canal, prioridad, id_categoria, id_cliente, id_agente, creado_por)
      OUTPUT INSERTED.id, INSERTED.numero_legible
      VALUES (NEWID(), @titulo, @descripcion, 'email', @prioridad, @id_categoria, @id_cliente, @id_agente, @creado_por)
    `);

  const ticket = ticketResult.recordset[0];

  // Historial
  await pool.request()
    .input('id_ticket',  sql.UniqueIdentifier, ticket.id)
    .input('id_usuario', sql.UniqueIdentifier, id_cliente)
    .query(`
      INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
      VALUES (NEWID(), @id_ticket, @id_usuario, 'creacion', 'Ticket creado desde correo electrónico')
    `);

  if (id_agente) {
    await pool.request()
      .input('id_ticket',  sql.UniqueIdentifier, ticket.id)
      .input('id_usuario', sql.UniqueIdentifier, id_cliente)
      .query(`
        INSERT INTO Historial_Tickets (id, id_ticket, id_usuario, accion, detalle)
        VALUES (NEWID(), @id_ticket, @id_usuario, 'asignacion', 'Agente asignado automáticamente por menor carga')
      `);
  }

  // Email de confirmación del ticket
  try {
    await enviarCorreo({
      para:   email,
      asunto: `Ticket ${ticket.numero_legible} registrado — Servicios Integrales S.A.`,
      html:   ticketCreadoTemplate({
        nombre,
        numero_legible: ticket.numero_legible,
        titulo,
        descripcion,
        categoria: CATEGORIA_DEFAULT,
        agente_asignado: !!id_agente,
        canal_email: true,
      }),
    });
  } catch (err) {
    console.error('[EmailListener] Error al enviar confirmación de ticket:', err.message);
  }

  console.log(`[EmailListener] Ticket ${ticket.numero_legible} creado desde correo de ${email}`);
};

// =============================================
// REVISAR BANDEJA Y PROCESAR NO LEÍDOS
// =============================================

const revisarCorreos = async () => {
  const client = new ImapFlow({
    host:   process.env.IMAP_HOST || 'imap.gmail.com',
    port:   parseInt(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    logger: false,
  });

  // Capturar errores de socket para que no maten el proceso
  client.on('error', (err) => {
    console.error('[EmailListener] Error de socket IMAP:', err.message);
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Buscar UIDs de correos no leídos
      const uids = await client.search({ seen: false }, { uid: true });

      if (uids.length === 0) {
        return;
      }

      console.log(`[EmailListener] ${uids.length} correo(s) no leído(s) encontrado(s).`);

      const pool = await getConnection();

      // Paso 1: recolectar todos los mensajes antes de procesar
      // (no se puede llamar messageFlagsAdd mientras el stream de fetch está activo)
      const mensajes = [];
      for await (const msg of client.fetch(uids, { source: true, uid: true }, { uid: true })) {
        mensajes.push({ uid: msg.uid, source: msg.source });
      }

      // Paso 2: procesar cada mensaje
      for (const { uid, source } of mensajes) {
        try {
          const parsed = await simpleParser(source);
          await procesarCorreo(pool, parsed);
        } catch (err) {
          console.error('[EmailListener] Error al procesar correo:', err.message);
        }
      }

      // Paso 3: marcar todos como leídos de una vez (stream ya cerrado)
      const uidRange = mensajes.map(m => m.uid).join(',');
      await client.messageFlagsAdd(uidRange, ['\\Seen'], { uid: true });
      console.log(`[EmailListener] ${mensajes.length} correo(s) marcado(s) como leído(s).`);
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('[EmailListener] Error de conexión IMAP:', err.message);
    try { await client.logout(); } catch (_) {}
  }
};

// =============================================
// INICIAR LISTENER
// =============================================

const iniciarEmailListener = () => {
  console.log(`[EmailListener] Iniciado. Revisando cada ${INTERVALO_MS / 1000}s. Categoría default: "${CATEGORIA_DEFAULT}"`);

  // Primera revisión inmediata al arrancar
  revisarCorreos();

  // Revisiones periódicas
  setInterval(revisarCorreos, INTERVALO_MS);
};

module.exports = { iniciarEmailListener };
