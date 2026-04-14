const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getConnection, sql } = require('../config/db');
const { enviarCorreo } = require('../config/mailer');
const { resetPasswordTemplate } = require('../config/emailTemplates');
require('dotenv').config();

const register = async (req, res) => {
  const { nombre, apellido, email, password, telefono } = req.body;

  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ mensaje: 'Nombre, apellido, email y password son requeridos.' });
  }

  try {
    const pool = await getConnection();

    // Verificar si el email ya existe
    const existe = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT id FROM Usuarios WHERE email = @email');

    if (existe.recordset.length > 0) {
      return res.status(409).json({ mensaje: 'El email ya está registrado.' });
    }

    // Obtener el rol cliente por defecto
    const rol = await pool.request()
      .input('nombre', sql.VarChar, 'cliente')
      .query('SELECT id FROM Roles WHERE nombre = @nombre');

    if (rol.recordset.length === 0) {
      return res.status(500).json({ mensaje: 'Rol cliente no encontrado.' });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('apellido', sql.VarChar, apellido)
      .input('email', sql.VarChar, email)
      .input('password', sql.VarChar, hash)
      .input('telefono', sql.VarChar, telefono || null)
      .input('id_rol', sql.UniqueIdentifier, rol.recordset[0].id)
      .query(`
        INSERT INTO Usuarios (id, nombre, apellido, email, password, telefono, id_rol)
        VALUES (NEWID(), @nombre, @apellido, @email, @password, @telefono, @id_rol)
      `);

    res.status(201).json({ mensaje: 'Usuario registrado correctamente.' });
  } catch (error) {
    console.error('Error en register:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ mensaje: 'Email y password son requeridos.' });
  }

  try {
    const pool = await getConnection();

    const result = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`
        SELECT u.id, u.nombre, u.apellido, u.email, u.password, u.activo, r.nombre AS rol
        FROM Usuarios u
        INNER JOIN Roles r ON r.id = u.id_rol
        WHERE u.email = @email
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }

    const usuario = result.recordset[0];

    if (!usuario.activo) {
      return res.status(403).json({ mensaje: 'Usuario deshabilitado. Contacte al administrador.' });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        rol: usuario.rol,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ mensaje: 'El email es requerido.' });
  }

  try {
    const pool = await getConnection();

    const result = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT id, nombre FROM Usuarios WHERE email = @email AND activo = 1');

    // Respuesta genérica por seguridad (no revelar si el email existe o no)
    if (result.recordset.length === 0) {
      return res.json({ mensaje: 'Si el correo existe, recibirás un código para restablecer tu contraseña.' });
    }

    const usuario = result.recordset[0];

    // Generar token de 6 dígitos
    const token = crypto.randomInt(100000, 999999).toString();
    const expira_en = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    // Invalidar tokens anteriores del usuario
    await pool.request()
      .input('id_usuario', sql.UniqueIdentifier, usuario.id)
      .query('UPDATE Password_Reset_Tokens SET usado = 1 WHERE id_usuario = @id_usuario AND usado = 0');

    // Guardar nuevo token
    await pool.request()
      .input('id_usuario', sql.UniqueIdentifier, usuario.id)
      .input('token', sql.VarChar, token)
      .input('expira_en', sql.DateTime, expira_en)
      .query(`
        INSERT INTO Password_Reset_Tokens (id, id_usuario, token, expira_en)
        VALUES (NEWID(), @id_usuario, @token, @expira_en)
      `);

    // Enviar correo
    await enviarCorreo({
      para: email,
      asunto: 'Restablecer contraseña — Sistema de Tickets',
      html: resetPasswordTemplate({ nombre: usuario.nombre, token }),
    });

    res.json({ mensaje: 'Si el correo existe, recibirás un código para restablecer tu contraseña.' });
  } catch (error) {
    console.error('Error en forgotPassword:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const resetPassword = async (req, res) => {
  const { email, token, password_nuevo } = req.body;

  if (!email || !token || !password_nuevo) {
    return res.status(400).json({ mensaje: 'Email, token y password_nuevo son requeridos.' });
  }

  try {
    const pool = await getConnection();

    // Buscar usuario
    const usuarioResult = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT id FROM Usuarios WHERE email = @email AND activo = 1');

    if (usuarioResult.recordset.length === 0) {
      return res.status(400).json({ mensaje: 'Datos inválidos.' });
    }

    const id_usuario = usuarioResult.recordset[0].id;

    // Verificar token
    const tokenResult = await pool.request()
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .input('token', sql.VarChar, token)
      .query(`
        SELECT id FROM Password_Reset_Tokens
        WHERE id_usuario = @id_usuario
          AND token      = @token
          AND usado      = 0
          AND expira_en  > GETDATE()
      `);

    if (tokenResult.recordset.length === 0) {
      return res.status(400).json({ mensaje: 'El código es inválido o ha expirado.' });
    }

    // Actualizar contraseña
    const hash = await bcrypt.hash(password_nuevo, 10);
    await pool.request()
      .input('id_usuario', sql.UniqueIdentifier, id_usuario)
      .input('password', sql.VarChar, hash)
      .query(`
        UPDATE Usuarios
        SET password = @password, actualizado_en = GETDATE()
        WHERE id = @id_usuario
      `);

    // Marcar token como usado
    await pool.request()
      .input('id', sql.UniqueIdentifier, tokenResult.recordset[0].id)
      .query('UPDATE Password_Reset_Tokens SET usado = 1 WHERE id = @id');

    res.json({ mensaje: 'Contraseña restablecida correctamente.' });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const logout = async (req, res) => {
  const token = req.token;
  const { exp } = req.usuario; // fecha de expiración del JWT

  try {
    const pool = await getConnection();

    await pool.request()
      .input('token', sql.VarChar, token)
      .input('expira_en', sql.DateTime, new Date(exp * 1000))
      .query(`
        INSERT INTO Token_Blacklist (id, token, expira_en)
        VALUES (NEWID(), @token, @expira_en)
      `);

    res.json({ mensaje: 'Sesión cerrada correctamente.' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { register, login, forgotPassword, resetPassword, logout };
