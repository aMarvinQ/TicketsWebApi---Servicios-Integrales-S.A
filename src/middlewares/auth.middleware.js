const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('../config/db');
require('dotenv').config();

const verificarToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ mensaje: 'Acceso denegado. Token requerido.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar si el token está en la blacklist
    const pool = await getConnection();
    const blacklist = await pool.request()
      .input('token', sql.VarChar, token)
      .query('SELECT id FROM Token_Blacklist WHERE token = @token');

    if (blacklist.recordset.length > 0) {
      return res.status(401).json({ mensaje: 'Sesión cerrada. Inicia sesión nuevamente.' });
    }

    req.usuario = decoded;
    req.token = token;
    next();
  } catch (error) {
    return res.status(403).json({ mensaje: 'Token inválido o expirado.' });
  }
};

const soloAdmin = (req, res, next) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ mensaje: 'Acceso denegado. Se requiere rol administrador.' });
  }
  next();
};

const soloAgente = (req, res, next) => {
  if (req.usuario.rol !== 'agente' && req.usuario.rol !== 'admin') {
    return res.status(403).json({ mensaje: 'Acceso denegado. Se requiere rol agente.' });
  }
  next();
};

module.exports = { verificarToken, soloAdmin, soloAgente };
