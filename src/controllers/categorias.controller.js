const { getConnection, sql } = require('../config/db');

const listarCategorias = async (req, res) => {
  try {
    const pool = await getConnection();
    const { activo, search, page = 1, limit = 10 } = req.query;
    const { rol } = req.usuario;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const request = pool.request();

    // Clientes y agentes solo ven categorías activas
    let whereClause = rol === 'admin' ? 'WHERE 1=1' : 'WHERE activo = 1';

    if (rol === 'admin' && activo !== undefined) {
      whereClause += ' AND activo = @activo';
      request.input('activo', sql.Bit, activo === 'true' ? 1 : 0);
    }

    if (search) {
      whereClause += ' AND (nombre LIKE @search OR descripcion LIKE @search)';
      request.input('search', sql.VarChar, `%${search}%`);
    }

    const totalResult = await pool.request()
      .input('activo', sql.Bit, activo !== undefined ? (activo === 'true' ? 1 : 0) : null)
      .input('search', sql.VarChar, search ? `%${search}%` : null)
      .query(`SELECT COUNT(*) AS total FROM Categorias ${whereClause}`);

    const total = totalResult.recordset[0].total;

    request.input('limit', sql.Int, parseInt(limit));
    request.input('offset', sql.Int, offset);

    const result = await request.query(`
      SELECT id, nombre, descripcion, prioridad_default, activo, creado_en
      FROM Categorias
      ${whereClause}
      ORDER BY nombre ASC
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
    console.error('Error en listarCategorias:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const obtenerCategoria = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id, nombre, descripcion, prioridad_default, activo, creado_en, actualizado_en FROM Categorias WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Categoría no encontrada.' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error en obtenerCategoria:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const crearCategoria = async (req, res) => {
  const { nombre, descripcion, prioridad_default = 'bajo' } = req.body;
  const { id } = req.usuario;

  if (!nombre) {
    return res.status(400).json({ mensaje: 'El nombre es requerido.' });
  }

  const prioridadesValidas = ['critico', 'alto', 'medio', 'bajo'];
  if (!prioridadesValidas.includes(prioridad_default)) {
    return res.status(400).json({ mensaje: 'prioridad_default no válida. Use: critico, alto, medio, bajo.' });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .query('SELECT id FROM Categorias WHERE nombre = @nombre');

    if (existe.recordset.length > 0) {
      return res.status(409).json({ mensaje: 'Ya existe una categoría con ese nombre.' });
    }

    await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('descripcion', sql.VarChar, descripcion || null)
      .input('prioridad_default', sql.VarChar, prioridad_default)
      .input('creado_por', sql.UniqueIdentifier, id)
      .query(`
        INSERT INTO Categorias (id, nombre, descripcion, prioridad_default, creado_por)
        VALUES (NEWID(), @nombre, @descripcion, @prioridad_default, @creado_por)
      `);

    res.status(201).json({ mensaje: 'Categoría creada correctamente.' });
  } catch (error) {
    console.error('Error en crearCategoria:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const actualizarCategoria = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, prioridad_default } = req.body;
  const id_admin = req.usuario.id;

  if (!nombre && !descripcion && !prioridad_default) {
    return res.status(400).json({ mensaje: 'Debe enviar al menos un campo para actualizar.' });
  }

  try {
    const pool = await getConnection();

    const existe = await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .query('SELECT id FROM Categorias WHERE id = @id');

    if (existe.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Categoría no encontrada.' });
    }

    if (nombre) {
      const nombreDuplicado = await pool.request()
        .input('nombre', sql.VarChar, nombre)
        .input('id', sql.UniqueIdentifier, id)
        .query('SELECT id FROM Categorias WHERE nombre = @nombre AND id != @id');

      if (nombreDuplicado.recordset.length > 0) {
        return res.status(409).json({ mensaje: 'Ya existe una categoría con ese nombre.' });
      }
    }

    const campos = [];
    const request = pool.request().input('id', sql.UniqueIdentifier, id);

    if (nombre)            { campos.push('nombre = @nombre');                       request.input('nombre', sql.VarChar, nombre); }
    if (descripcion)       { campos.push('descripcion = @descripcion');             request.input('descripcion', sql.VarChar, descripcion); }
    if (prioridad_default) { campos.push('prioridad_default = @prioridad_default'); request.input('prioridad_default', sql.VarChar, prioridad_default); }

    campos.push('actualizado_en = GETDATE()', 'actualizado_por = @actualizado_por');
    request.input('actualizado_por', sql.UniqueIdentifier, id_admin);

    await request.query(`UPDATE Categorias SET ${campos.join(', ')} WHERE id = @id`);

    res.json({ mensaje: 'Categoría actualizada correctamente.' });
  } catch (error) {
    console.error('Error en actualizarCategoria:', error);
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
      .query('SELECT activo FROM Categorias WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ mensaje: 'Categoría no encontrada.' });
    }

    const nuevoEstado = result.recordset[0].activo ? 0 : 1;

    await pool.request()
      .input('id', sql.UniqueIdentifier, id)
      .input('activo', sql.Bit, nuevoEstado)
      .input('id_admin', sql.UniqueIdentifier, id_admin)
      .query(`
        UPDATE Categorias
        SET activo = @activo, actualizado_en = GETDATE(), actualizado_por = @id_admin
        WHERE id = @id
      `);

    res.json({ mensaje: `Categoría ${nuevoEstado ? 'habilitada' : 'deshabilitada'} correctamente.` });
  } catch (error) {
    console.error('Error en toggleActivo:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { listarCategorias, obtenerCategoria, crearCategoria, actualizarCategoria, toggleActivo };
