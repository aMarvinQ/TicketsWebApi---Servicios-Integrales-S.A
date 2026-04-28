const bcrypt = require('bcryptjs');
const { getConnection, sql } = require('../config/db');
const { enviarCorreo } = require('../config/mailer');
const { bienvenidaClienteTemplate } = require('../config/emailTemplates');

// =============================================
// PERFIL PROPIO
// =============================================

const obtenerPerfil = async (req, res) => {
  const { id } = req.usuario;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(`
        SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.activo,
               r.nombre AS rol, u.creado_en
        FROM Usuarios u
        INNER JOIN Roles r ON r.id = u.id_rol
        WHERE u.id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error en obtenerPerfil:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const actualizarPerfil = async (req, res) => {
  const { id } = req.usuario;
  const { nombre, apellido, telefono } = req.body;

  if (!nombre && !apellido && !telefono) {
    return res.status(400).json({ mensaje: 'Debe enviar al menos un campo para actualizar.' });
  }

  try {
    const pool = await getConnection();
    const campos = [];
    const request = pool.request().input('id', sql.UniqueIdentifier, id);

    if (nombre)   { campos.push('nombre = @nombre');     request.input('nombre', sql.VarChar, nombre); }
    if (apellido) { campos.push('apellido = @apellido'); request.input('apellido', sql.VarChar, apellido); }
    campos.push('telefono = @telefono'); request.input('telefono', sql.VarChar, telefono);

    campos.push('actualizado_en = GETDATE()', 'actualizado_por = @actualizado_por');
    request.input('actualizado_por', sql.UniqueIdentifier, id);

    await request.query(`UPDATE Usuarios SET ${campos.join(', ')} WHERE id = @id`);

    res.json({ mensaje: 'Perfil actualizado correctamente.' });
  } catch (error) {
    console.error('Error en actualizarPerfil:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const cambiarPassword = async (req, res) => {
  const { id } = req.usuario;
  const { password_actual, password_nuevo } = req.body;

  if (!password_actual || !password_nuevo) {
    return res.status(400).json({ mensaje: 'Password actual y nuevo son requeridos.' });
  }

  try {
    const pool = await getConnection();

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT password FROM Usuarios WHERE id = @id');

    const passwordValido = await bcrypt.compare(password_actual, result.recordset[0].password);
    if (!passwordValido) {
      return res.status(401).json({ mensaje: 'La contraseña actual es incorrecta.' });
    }

    const hash = await bcrypt.hash(password_nuevo, 10);
    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('password', sql.VarChar, hash)
      .query(`
        UPDATE Usuarios
        SET password = @password, actualizado_en = GETDATE(), actualizado_por = @id
        WHERE id = @id
      `);

    res.json({ mensaje: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('Error en cambiarPassword:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// GESTIÓN DE USUARIOS (SOLO ADMIN)
// =============================================

const listarUsuarios = async (req, res) => {
  try {
    const pool = await getConnection();
    const { rol, activo, search, page = 1, limit = 10 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { id: id_admin } = req.usuario;
    const request = pool.request().input('id_admin', sql.UniqueIdentifier, id_admin);

    let whereClause = 'WHERE u.id != @id_admin';

    if (rol) {
      whereClause += ' AND r.nombre = @rol';
      request.input('rol', sql.VarChar, rol);
    }

    if (activo !== undefined) {
      whereClause += ' AND u.activo = @activo';
      request.input('activo', sql.Bit, activo === 'true' ? 1 : 0);
    }

    if (search) {
      whereClause += ` AND (
        u.nombre   LIKE @search OR
        u.apellido LIKE @search OR
        u.email    LIKE @search
      )`;
      request.input('search', sql.VarChar, `%${search}%`);
    }

    // Total de registros
    const totalResult = await pool.request()
      .input('id_admin', sql.UniqueIdentifier, id_admin)
      .input('rol', sql.VarChar, rol || null)
      .input('activo', sql.Bit, activo !== undefined ? (activo === 'true' ? 1 : 0) : null)
      .input('search', sql.VarChar, search ? `%${search}%` : null)
      .query(`
        SELECT COUNT(*) AS total
        FROM Usuarios u
        INNER JOIN Roles r ON r.id = u.id_rol
        ${whereClause}
      `);

    const total = totalResult.recordset[0].total;

    // Datos paginados
    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, offset);

    const result = await request.query(`
      SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.activo,
             r.nombre AS rol, u.creado_en
      FROM Usuarios u
      INNER JOIN Roles r ON r.id = u.id_rol
      ${whereClause}
      ORDER BY u.creado_en DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      datos: result.recordset,
      paginacion: {
        total,
        pagina: parseInt(page),
        limit: parseInt(limit),
        paginas: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error en listarUsuarios:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const obtenerUsuario = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(`
        SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.activo,
               r.nombre AS rol, u.creado_en, u.actualizado_en
        FROM Usuarios u
        INNER JOIN Roles r ON r.id = u.id_rol
        WHERE u.id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error en obtenerUsuario:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const crearUsuario = async (req, res) => {
  const { nombre, apellido, email, password, telefono, rol } = req.body;
  const { id: id_creador, rol: rol_creador } = req.usuario;

  if (!nombre || !apellido || !email || !password || !rol) {
    return res.status(400).json({ mensaje: 'Nombre, apellido, email, password y rol son requeridos.' });
  }

  // Agentes solo pueden crear clientes. Admins pueden crear cualquier rol.
  const rolesPermitidosAdmin  = ['agente', 'admin', 'cliente'];
  const rolesPermitidosAgente = ['cliente'];

  const rolesPermitidos = rol_creador === 'admin' ? rolesPermitidosAdmin : rolesPermitidosAgente;

  if (!rolesPermitidos.includes(rol)) {
    return res.status(403).json({
      mensaje: rol_creador === 'admin'
        ? 'Rol no válido. Use: agente, admin o cliente.'
        : 'Los agentes solo pueden crear usuarios con rol cliente.'
    });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT id FROM Usuarios WHERE email = @email');

    if (existe.recordset.length > 0) {
      return res.status(409).json({ mensaje: 'El email ya está registrado.' });
    }

    const rolResult = await pool.request()
      .input('nombre', sql.VarChar, rol)
      .query('SELECT id FROM Roles WHERE nombre = @nombre');

    if (rolResult.recordset.length === 0) {
      return res.status(400).json({ mensaje: 'Rol no válido.' });
    }

    const hash = await bcrypt.hash(password, 10);

    const nuevoUsuario = await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('apellido', sql.VarChar, apellido)
      .input('email', sql.VarChar, email)
      .input('password', sql.VarChar, hash)
      .input('telefono', sql.VarChar, telefono || null)
      .input('id_rol', sql.UniqueIdentifier, rolResult.recordset[0].id)
      .input('creado_por', sql.UniqueIdentifier, id_creador)
      .query(`
        INSERT INTO Usuarios (id, nombre, apellido, email, password, telefono, id_rol, creado_por)
        OUTPUT INSERTED.id
        VALUES (NEWID(), @nombre, @apellido, @email, @password, @telefono, @id_rol, @creado_por)
      `);

    const id_nuevo = nuevoUsuario.recordset[0].id;

    // Enviar email de bienvenida solo a clientes
    if (rol === 'cliente') {
      try {
        await enviarCorreo({
          para: email,
          asunto: 'Bienvenido al Sistema de Tickets — Servicios Integrales S.A.',
          html: bienvenidaClienteTemplate({ nombre, email, password }),
        });
      } catch (mailError) {
        console.error('Error al enviar email de bienvenida:', mailError);
        // No interrumpir la respuesta si el correo falla
      }
    }

    res.status(201).json({
      mensaje: `Usuario ${rol} creado correctamente.`,
      id: id_nuevo,
    });
  } catch (error) {
    console.error('Error en crearUsuario:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const actualizarUsuario = async (req, res) => {
  const { id } = req.params;
  const { nombre, apellido, telefono, rol } = req.body;
  const id_admin = req.usuario.id;

  if (!nombre && !apellido && !telefono && !rol) {
    return res.status(400).json({ mensaje: 'Debe enviar al menos un campo para actualizar.' });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id FROM Usuarios WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    const campos = [];
    const request = pool.request().input('id', sql.UniqueIdentifier, id);

    if (nombre)   { campos.push('nombre = @nombre');     request.input('nombre', sql.VarChar, nombre); }
    if (apellido) { campos.push('apellido = @apellido'); request.input('apellido', sql.VarChar, apellido); }
    if (telefono) { campos.push('telefono = @telefono'); request.input('telefono', sql.VarChar, telefono); }

    if (rol) {
      const rolResult = await pool.request()
        .input('nombre', sql.VarChar, rol)
        .query('SELECT id FROM Roles WHERE nombre = @nombre');

      if (rolResult.recordset.length === 0) {
        return res.status(400).json({ mensaje: 'Rol no válido.' });
      }
      campos.push('id_rol = @id_rol');
      request.input('id_rol', sql.UniqueIdentifier, rolResult.recordset[0].id);
    }

    campos.push('actualizado_en = GETDATE()', 'actualizado_por = @actualizado_por');
    request.input('actualizado_por', sql.UniqueIdentifier, id_admin);

    await request.query(`UPDATE Usuarios SET ${campos.join(', ')} WHERE id = @id`);

    res.json({ mensaje: 'Usuario actualizado correctamente.' });
  } catch (error) {
    console.error('Error en actualizarUsuario:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const resetPasswordAdmin = async (req, res) => {
  const { id } = req.params;
  const { password_nuevo } = req.body;
  const id_admin = req.usuario.id;

  if (!password_nuevo) {
    return res.status(400).json({ mensaje: 'El password_nuevo es requerido.' });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id FROM Usuarios WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    const hash = await bcrypt.hash(password_nuevo, 10);
    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('password', sql.VarChar, hash)
      .input('id_admin', sql.UniqueIdentifier, id_admin)
      .query(`
        UPDATE Usuarios
        SET password = @password, actualizado_en = GETDATE(), actualizado_por = @id_admin
        WHERE id = @id
      `);

    res.json({ mensaje: 'Contraseña restablecida correctamente.' });
  } catch (error) {
    console.error('Error en resetPasswordAdmin:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const toggleActivo = async (req, res) => {
  const { id } = req.params;
  const id_admin = req.usuario.id;

  try {
    const pool = await getConnection();

    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT activo FROM Usuarios WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    const nuevoEstado = result.recordset[0].activo ? 0 : 1;

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('activo', sql.Bit, nuevoEstado)
      .input('id_admin', sql.UniqueIdentifier, id_admin)
      .query(`
        UPDATE Usuarios
        SET activo = @activo, actualizado_en = GETDATE(), actualizado_por = @id_admin
        WHERE id = @id
      `);

    res.json({ mensaje: `Usuario ${nuevoEstado ? 'habilitado' : 'deshabilitado'} correctamente.` });
  } catch (error) {
    console.error('Error en toggleActivo:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// CONSULTA DE AGENTES / CLIENTES
// =============================================

const listarClientes = async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT u.id, u.nombre, u.apellido, u.email
      FROM Usuarios u
      INNER JOIN Roles r ON r.id = u.id_rol
      WHERE r.nombre = 'cliente' AND u.activo = 1
      ORDER BY u.nombre
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error en listarClientes:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const listarAgentes = async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT u.id, u.nombre, u.apellido, u.email, u.telefono
      FROM Usuarios u
      INNER JOIN Roles r ON r.id = u.id_rol
      WHERE r.nombre = 'agente' AND u.activo = 1
      ORDER BY u.nombre
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error en listarAgentes:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = {
  obtenerPerfil, actualizarPerfil, cambiarPassword,
  listarUsuarios, obtenerUsuario, crearUsuario,
  actualizarUsuario, resetPasswordAdmin, toggleActivo,
  listarAgentes, listarClientes,
};
