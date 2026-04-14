const { getConnection, sql } = require('../config/db');

const listarReglas = async (req, res) => {
  try {
    const pool = await getConnection();
    const { activo, id_categoria, prioridad, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const request = pool.request();

    let whereClause = 'WHERE 1=1';

    if (activo !== undefined) {
      whereClause += ' AND r.activo = @activo';
      request.input('activo', sql.Bit, activo === 'true' ? 1 : 0);
    }

    if (id_categoria) {
      whereClause += ' AND r.id_categoria = @id_categoria';
      request.input('id_categoria', sql.UniqueIdentifier, id_categoria);
    }

    if (prioridad) {
      whereClause += ' AND r.prioridad = @prioridad';
      request.input('prioridad', sql.VarChar, prioridad);
    }

    const totalResult = await pool.request()
      .input('activo', sql.Bit, activo !== undefined ? (activo === 'true' ? 1 : 0) : null)
      .input('id_categoria', sql.UniqueIdentifier, id_categoria || null)
      .input('prioridad', sql.VarChar, prioridad || null)
      .query(`
        SELECT COUNT(*) AS total
        FROM Reglas_Asignacion r
        ${whereClause}
      `);

    const total = totalResult.recordset[0].total;

    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, offset);

    const result = await request.query(`
      SELECT
        r.id, r.prioridad, r.activo, r.creado_en,
        c.nombre AS categoria,
        u.nombre + ' ' + u.apellido AS agente,
        u.email AS agente_email,
        (
          SELECT COUNT(*) FROM Tickets t
          WHERE t.id_agente = r.id_agente
            AND t.estado IN ('abierto', 'en_progreso')
        ) AS tickets_activos
      FROM Reglas_Asignacion r
      INNER JOIN Categorias c ON c.id = r.id_categoria
      INNER JOIN Usuarios   u ON u.id = r.id_agente
      ${whereClause}
      ORDER BY c.nombre ASC, r.prioridad ASC, u.nombre ASC
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
    console.error('Error en listarReglas:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const obtenerRegla = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query(`
        SELECT
          r.id, r.prioridad, r.activo, r.creado_en, r.actualizado_en,
          r.id_categoria, c.nombre AS categoria,
          r.id_agente, u.nombre + ' ' + u.apellido AS agente, u.email AS agente_email
        FROM Reglas_Asignacion r
        INNER JOIN Categorias c ON c.id = r.id_categoria
        INNER JOIN Usuarios   u ON u.id = r.id_agente
        WHERE r.id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Regla no encontrada.' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error en obtenerRegla:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const crearRegla = async (req, res) => {
  const { id_categoria, prioridad, id_agente } = req.body;
  const id_admin = req.usuario.id;

  if (!id_categoria || !prioridad || !id_agente) {
    return res.status(400).json({ mensaje: 'id_categoria, prioridad e id_agente son requeridos.' });
  }

  const prioridadesValidas = ['critico', 'alto', 'medio', 'bajo'];
  if (!prioridadesValidas.includes(prioridad)) {
    return res.status(400).json({ mensaje: 'Prioridad no válida. Use: critico, alto, medio, bajo.' });
  }

  try {
    const pool = await getConnection();

    // Verificar que la categoría existe y está activa
    const categoria = await pool.request()
      .input('id_categoria', sql.UniqueIdentifier, id_categoria)
      .query('SELECT id FROM Categorias WHERE id = @id_categoria AND activo = 1');

    if (categoria.recordset.length === 0) {
      return res.status(400).json({ mensaje: 'La categoría no existe o está deshabilitada.' });
    }

    // Verificar que el agente existe y tiene rol agente
    const agente = await pool.request()
      .input('id_agente', sql.UniqueIdentifier, id_agente)
      .query(`
        SELECT u.id FROM Usuarios u
        INNER JOIN Roles r ON r.id = u.id_rol
        WHERE u.id = @id_agente AND r.nombre = 'agente' AND u.activo = 1
      `);

    if (agente.recordset.length === 0) {
      return res.status(400).json({ mensaje: 'El agente no existe, no tiene rol agente o está deshabilitado.' });
    }

    // Verificar que no exista ya esa combinación para el mismo agente
    const duplicado = await pool.request()
      .input('id_categoria', sql.UniqueIdentifier, id_categoria)
      .input('prioridad', sql.VarChar, prioridad)
      .input('id_agente', sql.UniqueIdentifier, id_agente)
      .query(`
        SELECT id FROM Reglas_Asignacion
        WHERE id_categoria = @id_categoria
          AND prioridad    = @prioridad
          AND id_agente    = @id_agente
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({ mensaje: 'Ya existe una regla para este agente con esa categoría y prioridad.' });
    }

    await pool.request()
      .input('id_categoria', sql.UniqueIdentifier, id_categoria)
      .input('prioridad', sql.VarChar, prioridad)
      .input('id_agente', sql.UniqueIdentifier, id_agente)
      .input('creado_por', sql.UniqueIdentifier, id_admin)
      .query(`
        INSERT INTO Reglas_Asignacion (id, id_categoria, prioridad, id_agente, creado_por)
        VALUES (NEWID(), @id_categoria, @prioridad, @id_agente, @creado_por)
      `);

    res.status(201).json({ mensaje: 'Regla de asignación creada correctamente.' });
  } catch (error) {
    console.error('Error en crearRegla:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const actualizarRegla = async (req, res) => {
  const { id } = req.params;
  const { id_categoria, prioridad, id_agente } = req.body;
  const id_admin = req.usuario.id;

  if (!id_categoria && !prioridad && !id_agente) {
    return res.status(400).json({ mensaje: 'Debe enviar al menos un campo para actualizar.' });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id, id_categoria, prioridad, id_agente FROM Reglas_Asignacion WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Regla no encontrada.' });
    }

    const reglaActual = existe.recordset[0];
    const nuevaCategoria = id_categoria || reglaActual.id_categoria;
    const nuevaPrioridad = prioridad    || reglaActual.prioridad;
    const nuevoAgente    = id_agente    || reglaActual.id_agente;

    if (prioridad) {
      const prioridadesValidas = ['critico', 'alto', 'medio', 'bajo'];
      if (!prioridadesValidas.includes(prioridad)) {
        return res.status(400).json({ mensaje: 'Prioridad no válida. Use: critico, alto, medio, bajo.' });
      }
    }

    if (id_agente) {
      const agente = await pool.request()
        .input('id_agente', sql.UniqueIdentifier, id_agente)
        .query(`
          SELECT u.id FROM Usuarios u
          INNER JOIN Roles r ON r.id = u.id_rol
          WHERE u.id = @id_agente AND r.nombre = 'agente' AND u.activo = 1
        `);

      if (agente.recordset.length === 0) {
        return res.status(400).json({ mensaje: 'El agente no existe, no tiene rol agente o está deshabilitado.' });
      }
    }

    // Verificar duplicado excluyendo la regla actual
    const duplicado = await pool.request()
      .input('id_categoria', sql.UniqueIdentifier, nuevaCategoria)
      .input('prioridad', sql.VarChar, nuevaPrioridad)
      .input('id_agente', sql.UniqueIdentifier, nuevoAgente)
      .input('id', sql.UniqueIdentifier, id)
      .query(`
        SELECT id FROM Reglas_Asignacion
        WHERE id_categoria = @id_categoria
          AND prioridad    = @prioridad
          AND id_agente    = @id_agente
          AND id           != @id
      `);

    if (duplicado.recordset.length > 0) {
      return res.status(409).json({ mensaje: 'Ya existe una regla para este agente con esa categoría y prioridad.' });
    }

    const campos = [];
    const request = pool.request().input('id', sql.UniqueIdentifier, id);

    if (id_categoria) { campos.push('id_categoria = @id_categoria'); request.input('id_categoria', sql.UniqueIdentifier, id_categoria); }
    if (prioridad)    { campos.push('prioridad = @prioridad');         request.input('prioridad', sql.VarChar, prioridad); }
    if (id_agente)    { campos.push('id_agente = @id_agente');         request.input('id_agente', sql.UniqueIdentifier, id_agente); }

    campos.push('actualizado_en = GETDATE()', 'actualizado_por = @actualizado_por');
    request.input('actualizado_por', sql.UniqueIdentifier, id_admin);

    await request.query(`UPDATE Reglas_Asignacion SET ${campos.join(', ')} WHERE id = @id`);

    res.json({ mensaje: 'Regla actualizada correctamente.' });
  } catch (error) {
    console.error('Error en actualizarRegla:', error);
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
      .query('SELECT activo FROM Reglas_Asignacion WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Regla no encontrada.' });
    }

    const nuevoEstado = result.recordset[0].activo ? 0 : 1;

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('activo', sql.Bit, nuevoEstado)
      .input('id_admin', sql.UniqueIdentifier, id_admin)
      .query(`
        UPDATE Reglas_Asignacion
        SET activo = @activo, actualizado_en = GETDATE(), actualizado_por = @id_admin
        WHERE id = @id
      `);

    res.json({ mensaje: `Regla ${nuevoEstado ? 'habilitada' : 'deshabilitada'} correctamente.` });
  } catch (error) {
    console.error('Error en toggleActivo:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const eliminarRegla = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id FROM Reglas_Asignacion WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Regla no encontrada.' });
    }

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('DELETE FROM Reglas_Asignacion WHERE id = @id');

    res.json({ mensaje: 'Regla eliminada correctamente.' });
  } catch (error) {
    console.error('Error en eliminarRegla:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// =============================================
// Lógica de asignación automática por menor carga
// Usada internamente por el módulo de tickets
// =============================================
const obtenerAgentePorMenorCarga = async (pool, id_categoria, prioridad) => {
  const result = await pool.request()
    .input('id_categoria', sql.UniqueIdentifier, id_categoria)
    .input('prioridad', sql.VarChar, prioridad)
    .query(`
      SELECT
        r.id_agente,
        (
          SELECT COUNT(*) FROM Tickets t
          WHERE t.id_agente = r.id_agente
            AND t.estado IN ('abierto', 'en_progreso')
        ) AS tickets_activos
      FROM Reglas_Asignacion r
      WHERE r.id_categoria = @id_categoria
        AND r.prioridad    = @prioridad
        AND r.activo       = 1
      ORDER BY tickets_activos ASC
    `);

  if (result.recordset.length === 0) return null;
  return result.recordset[0].id_agente;
};

module.exports = {
  listarReglas, obtenerRegla, crearRegla,
  actualizarRegla, toggleActivo, eliminarRegla,
  obtenerAgentePorMenorCarga,
};
